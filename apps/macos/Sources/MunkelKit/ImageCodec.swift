import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Prepares images for sending and decodes incoming ones. Two outputs per send:
///
/// - `prepareFull` — the full-resolution image that gets sealed and uploaded to
///   R2. The source (JPEG, PNG, anything decodable) is ALWAYS transcoded to
///   AVIF and hard-capped at 2 MiB — AVIF is smaller at equal quality, which is
///   the whole point: minimize bytes on the wire.
/// - `makeThumbnail` — a tiny AVIF that rides inside the relay pointer for an
///   instant notch preview (same format as the full image — no second codec).
///
/// Decoding (`decode`) and the shared ImageIO primitives live here too; incoming
/// bytes are peer-controlled, so every decode is thumbnailed through a hard
/// pixel cap (a small file can declare huge dimensions — a decompression bomb).
public enum ImageCodec {
    /// Byte/pixel budget for the full image uploaded to R2. Matches the server's
    /// per-blob cap headroom (see apps/server/src/blob.ts, MAX_BLOB_BYTES). The
    /// pixel ceiling is well above the receiver's 1400px decode cap
    /// (MessageNotchView) so we don't ship pixels that are decoded away —
    /// byte cost scales ~quadratically with the longest side.
    public static let maxFullBytes = 2 * 1024 * 1024
    public static let maxFullPixels = 2048

    /// Inline-preview thumbnail budget. Kept small so the sealed pointer stays
    /// well under the relay's 48 KiB payload cap even after base64.
    public static let maxThumbBytes = 12 * 1024
    public static let maxThumbPixels = 256

    public struct Prepared: Equatable, Sendable {
        public let data: Data
        public let mime: String
        public let width: Int
        public let height: Int

        public init(data: Data, mime: String, width: Int, height: Int) {
            self.data = data
            self.mime = mime
            self.width = width
            self.height = height
        }
    }

    /// Full-resolution image ready to seal + upload. The source — JPEG, PNG or
    /// anything else decodable — is ALWAYS transcoded to AVIF (smaller at equal
    /// quality, one format on the wire) and hard-capped at `maxBytes` (2 MiB).
    /// Steps quality down, then pixel size, until it fits. Returns nil when the
    /// input is undecodable, AVIF encoding is unavailable, or it can't be
    /// compressed within budget.
    public static func prepareFull(
        from data: Data,
        maxBytes: Int = maxFullBytes,
        maxPixels: Int = maxFullPixels
    ) -> Prepared? {
        let sizes = [maxPixels, maxPixels * 3 / 4, maxPixels / 2].filter { $0 > 0 }
        for pixels in sizes {
            guard let image = downsample(data, maxPixels: pixels) else { return nil }
            for quality in [0.7, 0.5, 0.35] {
                if let avif = encodeAVIF(image, quality: quality), avif.count <= maxBytes {
                    return Prepared(data: avif, mime: "image/avif", width: image.width, height: image.height)
                }
            }
        }
        return nil
    }

    /// Small AVIF preview for the inline pointer — same format as the full
    /// image, so there's no separate JPEG version. Steps size down further than
    /// the full encoder so even an album's tiny per-image budget fits. nil when
    /// undecodable or uncompressible within budget.
    public static func makeThumbnail(
        from data: Data,
        maxBytes: Int = maxThumbBytes,
        maxPixels: Int = maxThumbPixels
    ) -> Data? {
        let sizes = [maxPixels, maxPixels * 3 / 4, maxPixels / 2, maxPixels / 4].filter { $0 > 0 }
        for pixels in sizes {
            guard let image = downsample(data, maxPixels: pixels) else { return nil }
            for quality in [0.6, 0.45, 0.3] {
                if let avif = encodeAVIF(image, quality: quality), avif.count <= maxBytes {
                    return avif
                }
            }
        }
        return nil
    }

    /// Safe decode for display: never materializes more than `maxPixels`.
    public static func decode(_ data: Data, maxPixels: Int = 1024) -> CGImage? {
        downsample(data, maxPixels: maxPixels)
    }

    // MARK: - Shared ImageIO primitives (also used by AvatarCodec)

    struct ImageInfo { let width: Int; let height: Int; let mime: String }

    /// Pixel dimensions and MIME of an encoded image, without decoding pixels.
    static func properties(of data: Data) -> ImageInfo? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = props[kCGImagePropertyPixelWidth] as? Int,
              let height = props[kCGImagePropertyPixelHeight] as? Int
        else {
            return nil
        }
        let mime = (CGImageSourceGetType(source).flatMap { UTType($0 as String) })
            .flatMap { $0.preferredMIMEType } ?? "application/octet-stream"
        return ImageInfo(width: width, height: height, mime: mime)
    }

    /// Thumbnail-decode with a hard longest-side cap — the bomb-safe path for
    /// peer-controlled bytes.
    static func downsample(_ data: Data, maxPixels: Int) -> CGImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            return nil
        }
        let thumbnailOptions = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ] as [CFString: Any] as CFDictionary
        return CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions)
    }

    static func encodeJPEG(_ image: CGImage, quality: Double) -> Data? {
        encode(image, type: UTType.jpeg, properties: [kCGImageDestinationLossyCompressionQuality: quality])
    }

    static func encodePNG(_ image: CGImage) -> Data? {
        encode(image, type: UTType.png, properties: [:])
    }

    /// System UTI for AVIF (ImageIO can encode it on macOS 14+). nil if the
    /// platform doesn't know the type, in which case encoding no-ops.
    private static let avifType = UTType("public.avif")

    static func encodeAVIF(_ image: CGImage, quality: Double) -> Data? {
        guard let avifType else { return nil }
        return encode(image, type: avifType, properties: [kCGImageDestinationLossyCompressionQuality: quality])
    }

    /// Whether ImageIO can actually encode AVIF here (one-time 1×1 probe). The
    /// whole feature transcodes to AVIF, so a future OS regression should be
    /// diagnosable instead of a silent no-op (every image would be dropped).
    public static let isAVIFEncodingAvailable: Bool = {
        guard let avifType,
              let context = CGContext(
                  data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 0,
                  space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ),
              let probe = context.makeImage()
        else {
            return false
        }
        return encode(probe, type: avifType, properties: [:]) != nil
    }()

    private static func encode(_ image: CGImage, type: UTType, properties: [CFString: Any]) -> Data? {
        let output = NSMutableData()
        guard
            let destination = CGImageDestinationCreateWithData(
                output, type.identifier as CFString, 1, nil
            )
        else {
            return nil
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
