import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import MunkelKit

/// Renders a noisy test image — noise compresses badly, which is exactly
/// what the budget stepping has to cope with.
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
    for y in 0..<height where y % 4 == 0 {
        for x in 0..<width where x % 4 == 0 {
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            let r = CGFloat((state >> 33) & 0xFF) / 255
            let g = CGFloat((state >> 41) & 0xFF) / 255
            let b = CGFloat((state >> 49) & 0xFF) / 255
            context.setFillColor(CGColor(srgbRed: r, green: g, blue: b, alpha: 1))
            context.fill(CGRect(x: x, y: y, width: 4, height: 4))
        }
    }
    let image = context.makeImage()!
    let output = NSMutableData()
    let destination = CGImageDestinationCreateWithData(
        output, UTType.png.identifier as CFString, 1, nil
    )!
    CGImageDestinationAddImage(destination, image, nil)
    CGImageDestinationFinalize(destination)
    return output as Data
}

@Suite("Avatar codec")
struct AvatarCodecTests {
    @Test func shrinksLargeImageUnderBudget() throws {
        let original = noisePNG(width: 512, height: 512)
        let avatar = try #require(AvatarCodec.makeAvatar(from: original))

        #expect(avatar.count <= AvatarCodec.maxEncodedBytes)

        let decoded = try #require(AvatarCodec.decodeImage(avatar))
        #expect(decoded.width <= AvatarCodec.maxEncodedPixels)
        #expect(decoded.height <= AvatarCodec.maxEncodedPixels)
    }

    @Test func keepsSmallImageDecodable() throws {
        let original = noisePNG(width: 64, height: 64)
        let avatar = try #require(AvatarCodec.makeAvatar(from: original))
        #expect(avatar.count <= AvatarCodec.maxEncodedBytes)
        #expect(AvatarCodec.decodeImage(avatar) != nil)
    }

    @Test func returnsNilForGarbageData() {
        #expect(AvatarCodec.makeAvatar(from: Data([0xDE, 0xAD, 0xBE, 0xEF])) == nil)
        #expect(AvatarCodec.decodeImage(Data([0xDE, 0xAD, 0xBE, 0xEF])) == nil)
    }

    @Test func decodeCapsAttackerDeclaredDimensions() throws {
        // A legitimate-looking large image must come out capped, never at
        // its declared size.
        let large = noisePNG(width: 2048, height: 512)
        let decoded = try #require(AvatarCodec.decodeImage(large, maxPixels: 256))
        #expect(max(decoded.width, decoded.height) <= 256)
    }
}
