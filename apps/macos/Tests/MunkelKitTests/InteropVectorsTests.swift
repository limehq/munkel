import CryptoKit
import Foundation
import Testing
@testable import MunkelKit

// MARK: - vectors.json schema

private struct VectorsFile: Decodable {
    struct DerivationEntry: Decodable {
        let code: String
        let groupId: String
    }

    struct PayloadEntry: Decodable {
        let id: String
        let json: String
    }

    struct SealedEntry: Decodable {
        let id: String
        let code: String
        let payloadId: String
        let nonceBase64: String
        let sealedBase64: String
    }

    struct CodecConstants: Decodable {
        struct Avatar: Decodable {
            let maxEncodedBytes: Int
            let maxEncodedPixels: Int
            let maxDecodedPixels: Int
        }

        struct Image: Decodable {
            let maxFullBytes: Int
            let maxFullPixels: Int
            let maxThumbBytes: Int
            let maxThumbPixels: Int
            let albumThumbBudget: Int
            let maxImagesPerMessage: Int
            let perThumbBudget: [String: Int]
        }

        let avatar: Avatar
        let image: Image
    }

    struct ImageFixture: Decodable {
        struct PrepareFull: Decodable {
            let mime: String
            let width: Int
            let height: Int
            let maxBytes: Int
            let sha256: String
        }

        struct MakeThumbnail: Decodable {
            let maxBytes: Int
            let sha256: String
        }

        let id: String
        let pngBase64: String
        let prepareFull: PrepareFull
        let makeThumbnail: MakeThumbnail
    }

    let version: Int
    let derivation: [DerivationEntry]
    let payloads: [PayloadEntry]
    let sealed: [SealedEntry]
    let codecConstants: CodecConstants
    let imageFixtures: [ImageFixture]
}

private func loadVectors() throws -> VectorsFile {
    let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // MunkelKitTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // macos
        .deletingLastPathComponent() // apps
        .deletingLastPathComponent() // repo root
    let url = repoRoot.appendingPathComponent("scripts/interop-vectors/vectors.json")
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(VectorsFile.self, from: data)
}

private func sha256Hex(_ data: Data) -> String {
    let digest = SHA256.hash(data: data)
    return digest.map { String(format: "%02x", $0) }.joined()
}

@Suite("Swift ↔ Windows interop vectors")
struct InteropVectorsTests {
    private static let vectors = try! loadVectors()

    @Test func vectorsFileVersion() {
        #expect(Self.vectors.version == 1)
        #expect(Self.vectors.sealed.count == Self.vectors.payloads.count)
    }

    @Test(arguments: Self.vectors.derivation)
    func groupIdMatchesWindows(entry: VectorsFile.DerivationEntry) {
        #expect(GroupKey(code: entry.code).groupId == entry.groupId)
    }

    @Test(arguments: Self.vectors.payloads)
    func payloadJSONDecodes(entry: VectorsFile.PayloadEntry) throws {
        _ = try AppPayload.decoded(from: Data(entry.json.utf8))
    }

    @Test(arguments: Self.vectors.sealed)
    func opensWindowsSealedBlob(entry: VectorsFile.SealedEntry) throws {
        let key = GroupKey(code: entry.code).messageKey
        let opened = try MessageCrypto.open(entry.sealedBase64, using: key)
        let canonical = try #require(Self.vectors.payloads.first { $0.id == entry.payloadId })
        #expect(String(data: opened, encoding: .utf8) == canonical.json)
        _ = try AppPayload.decoded(from: opened)
    }

    @Test(arguments: Self.vectors.sealed)
    func resealsToSameBlob(entry: VectorsFile.SealedEntry) throws {
        let canonical = try #require(Self.vectors.payloads.first { $0.id == entry.payloadId })
        let key = GroupKey(code: entry.code).messageKey
        guard let nonceData = Data(base64Encoded: entry.nonceBase64), nonceData.count == 12 else {
            Issue.record("invalid nonce for \(entry.id)")
            return
        }
        let nonce = try AES.GCM.Nonce(data: nonceData)
        let resealed = try MessageCrypto.seal(Data(canonical.json.utf8), using: key, nonce: nonce)
        #expect(resealed == entry.sealedBase64)
    }

    @Test func avatarCodecConstantsMatchWindows() {
        let avatar = Self.vectors.codecConstants.avatar
        #expect(AvatarCodec.maxEncodedBytes == avatar.maxEncodedBytes)
        #expect(AvatarCodec.maxEncodedPixels == avatar.maxEncodedPixels)
        #expect(avatar.maxDecodedPixels == 256)
    }

    @Test func imageCodecConstantsMatchWindows() {
        let image = Self.vectors.codecConstants.image
        #expect(ImageCodec.maxFullBytes == image.maxFullBytes)
        #expect(ImageCodec.maxFullPixels == image.maxFullPixels)
        #expect(ImageCodec.maxThumbBytes == image.maxThumbBytes)
        #expect(ImageCodec.maxThumbPixels == image.maxThumbPixels)
        #expect(AppPayload.maxImagesPerMessage == image.maxImagesPerMessage)
        #expect(AppPayload.perThumbBudget(imageCount: 1) == image.perThumbBudget["1"])
        #expect(AppPayload.perThumbBudget(imageCount: 8) == image.perThumbBudget["8"])
        #expect(AppPayload.perThumbBudget(imageCount: 64) == image.perThumbBudget["64"])
    }

    @Test(arguments: Self.vectors.imageFixtures)
    func imageCodecAVIFMatchesWindows(fixture: VectorsFile.ImageFixture) throws {
        guard let png = Data(base64Encoded: fixture.pngBase64) else {
            Issue.record("invalid png base64 for \(fixture.id)")
            return
        }
        let full = try #require(ImageCodec.prepareFull(from: png))
        #expect(full.mime == fixture.prepareFull.mime)
        #expect(full.width == fixture.prepareFull.width)
        #expect(full.height == fixture.prepareFull.height)
        #expect(full.data.count <= fixture.prepareFull.maxBytes)
        #expect(sha256Hex(full.data) == fixture.prepareFull.sha256)

        let thumb = try #require(ImageCodec.makeThumbnail(from: png, maxBytes: fixture.makeThumbnail.maxBytes))
        #expect(sha256Hex(thumb) == fixture.makeThumbnail.sha256)
    }
}
