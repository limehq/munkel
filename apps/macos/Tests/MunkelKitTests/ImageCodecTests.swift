import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import MunkelKit

/// Noisy PNG — noise compresses badly, which exercises the budget stepping.
private func noisePNG(width: Int, height: Int) -> Data {
    let context = CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )!
    var state: UInt64 = 0x9E37_79B9_7F4A_7C15
    for y in 0..<height where y % 2 == 0 {
        for x in 0..<width where x % 2 == 0 {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            let r = CGFloat((state >> 33) & 0xFF) / 255
            let g = CGFloat((state >> 41) & 0xFF) / 255
            let b = CGFloat((state >> 49) & 0xFF) / 255
            context.setFillColor(CGColor(srgbRed: r, green: g, blue: b, alpha: 1))
            context.fill(CGRect(x: x, y: y, width: 2, height: 2))
        }
    }
    let image = context.makeImage()!
    let output = NSMutableData()
    let destination = CGImageDestinationCreateWithData(output, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationFinalize(destination)
    return output as Data
}

/// True iff `data` is a real AVIF: an ISOBMFF `ftyp` box whose MAJOR brand is
/// avif/avis. Deliberately ignores the compatible-brand list — HEIC also lists
/// mif1/miaf there, so accepting those would let a silent HEIC/JPEG fallback
/// pass and defeat the "AVIF everywhere" guarantee. Minds Data's slice offset.
private func isAVIF(_ data: Data) -> Bool {
    guard data.count >= 12 else { return false }
    func byte(_ i: Int) -> UInt8 { data[data.startIndex + i] }
    let box = (4...7).map(byte)
    guard box == Array("ftyp".utf8) else { return false }
    let major = (8...11).map(byte)
    return major == Array("avif".utf8) || major == Array("avis".utf8)
}

/// AVIF *encoding* via ImageIO routes through a system media service that needs
/// a GUI/app context. A plain `swift test` CLI binary on a headless CI runner
/// has none, so `CGImageDestinationFinalize(public.avif)` blocks forever and the
/// job only ends at the 20-minute timeout (no output, since stdout is buffered).
/// GitHub Actions sets `CI`, so skip the encode tests there; they run locally
/// where a full window-server session is available. Decode/property tests never
/// reach the encoder and run everywhere.
private let avifEncodeRunsHere = ProcessInfo.processInfo.environment["CI"] == nil

@Suite("ImageCodec")
struct ImageCodecTests {
    @Test func readsPropertiesAndMime() {
        let png = noisePNG(width: 100, height: 60)
        let info = ImageCodec.properties(of: png)
        #expect(info?.width == 100)
        #expect(info?.height == 60)
        #expect(info?.mime == "image/png")
    }

    @Test(.enabled(if: avifEncodeRunsHere)) func prepareFullTranscodesToAVIF() {
        // A small PNG is still transcoded to AVIF (no passthrough) and is a
        // recognizable, decodable image of the same pixel size.
        let png = noisePNG(width: 64, height: 64)
        let prepared = try! #require(ImageCodec.prepareFull(from: png))
        #expect(prepared.mime == "image/avif")
        #expect(isAVIF(prepared.data)) // real AVIF bytes, not just the mime label
        #expect(prepared.data != png)
        #expect(prepared.width == 64)
        #expect(prepared.height == 64)
        #expect(ImageCodec.decode(prepared.data) != nil)
    }

    @Test(.enabled(if: avifEncodeRunsHere)) func prepareFullHardCapsSizeToBudget() {
        let big = noisePNG(width: 1200, height: 1200)
        let prepared = try! #require(ImageCodec.prepareFull(from: big, maxBytes: 80_000, maxPixels: 256))
        #expect(prepared.data.count <= 80_000)
        #expect(prepared.mime == "image/avif")
        #expect(isAVIF(prepared.data))
        #expect(max(prepared.width, prepared.height) <= 256)
    }

    @Test(.enabled(if: avifEncodeRunsHere)) func prepareFullDefaultsToPixelCeiling() {
        // With no explicit maxPixels, a large source is bounded by the default
        // ceiling (2048) — we don't ship pixels the receiver decodes away.
        #expect(ImageCodec.maxFullPixels == 2048)
        let big = noisePNG(width: 2400, height: 1000)
        let prepared = try! #require(ImageCodec.prepareFull(from: big))
        #expect(max(prepared.width, prepared.height) <= ImageCodec.maxFullPixels)
    }

    @Test(.enabled(if: avifEncodeRunsHere)) func makeThumbnailFitsBudget() {
        let big = noisePNG(width: 800, height: 800)
        let thumb = try! #require(ImageCodec.makeThumbnail(from: big))
        #expect(thumb.count <= ImageCodec.maxThumbBytes)
        #expect(isAVIF(thumb)) // the inline thumb is AVIF too — one format
        // And it stays decodable for display.
        #expect(ImageCodec.decode(thumb) != nil)
    }

    @Test(.enabled(if: avifEncodeRunsHere)) func makeThumbnailFitsTinyAlbumBudget() {
        // An 8-image album gives each thumb only ~2 KiB — AVIF must still fit.
        let big = noisePNG(width: 800, height: 800)
        let thumb = try! #require(ImageCodec.makeThumbnail(from: big, maxBytes: 2_048))
        #expect(thumb.count <= 2_048)
        #expect(isAVIF(thumb))
        #expect(ImageCodec.decode(thumb) != nil)
    }

    @Test(.enabled(if: avifEncodeRunsHere)) func avifEncodingIsAvailableHere() {
        // If this fails, the host can't encode AVIF and the whole feature
        // silently no-ops — make that loud. Skipped on CI (see avifEncodeRunsHere):
        // touching the probe there would deadlock the same way an encode does.
        #expect(ImageCodec.isAVIFEncodingAvailable)
    }

    @Test func decodeCapsPixels() {
        let png = noisePNG(width: 256, height: 256)
        let image = try! #require(ImageCodec.decode(png, maxPixels: 32))
        #expect(max(image.width, image.height) <= 32)
    }

    @Test func rejectsUndecodableInput() {
        let garbage = Data([0x00, 0x01, 0x02, 0x03])
        #expect(ImageCodec.properties(of: garbage) == nil)
        #expect(ImageCodec.prepareFull(from: garbage) == nil)
        #expect(ImageCodec.makeThumbnail(from: garbage) == nil)
    }
}
