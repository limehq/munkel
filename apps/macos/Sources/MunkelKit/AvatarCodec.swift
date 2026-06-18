import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Re-encodes avatars for the encrypted profile payload and decodes incoming
/// ones. Both directions go through ImageIO thumbnailing with a hard pixel
/// cap: outgoing to fit the relay frame budget, incoming because the bytes
/// are peer-controlled — a tiny JPEG may declare huge dimensions, and a
/// naive decode would happily allocate them.
public enum AvatarCodec {
    /// Raw-byte budget for outgoing avatars. The payload JSON base64s the
    /// data and the sealed blob is base64'd again into the relay frame
    /// ((4/3)² ≈ 1.78×) — the relay's 48 KiB cap allows ~27 KiB raw, so
    /// 20 KiB leaves headroom for the envelope.
    public static let maxEncodedBytes = 20_480
    public static let maxEncodedPixels = 128

    /// JPEG ≤ `maxBytes`, longest side ≤ `maxPixels`. Steps down quality,
    /// then size, until it fits. nil when the input is undecodable or
    /// uncompressible within budget. Shares the ImageIO primitives with
    /// `ImageCodec`.
    public static func makeAvatar(
        from data: Data,
        maxBytes: Int = maxEncodedBytes,
        maxPixels: Int = maxEncodedPixels
    ) -> Data? {
        let sizes = [maxPixels, maxPixels * 3 / 4, maxPixels / 2].filter { $0 > 0 }
        for pixels in sizes {
            guard let image = ImageCodec.downsample(data, maxPixels: pixels) else { return nil }
            for quality in [0.8, 0.6, 0.4] {
                if let jpeg = ImageCodec.encodeJPEG(image, quality: quality), jpeg.count <= maxBytes {
                    return jpeg
                }
            }
        }
        return nil
    }

    /// Safe decode for display: never materializes more than `maxPixels`.
    public static func decodeImage(_ data: Data, maxPixels: Int = 256) -> CGImage? {
        ImageCodec.downsample(data, maxPixels: maxPixels)
    }
}
