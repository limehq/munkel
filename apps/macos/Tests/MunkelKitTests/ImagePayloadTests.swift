import CryptoKit
import Foundation
import Testing
@testable import MunkelKit

@Suite("MessageCrypto raw")
struct MessageCryptoRawTests {
    private let key = GroupKey(code: "blue-table-42").messageKey

    @Test func sealRawRoundTrips() throws {
        let plaintext = Data((0..<5000).map { UInt8($0 & 0xFF) })
        let sealed = try MessageCrypto.sealRaw(plaintext, using: key)
        #expect(sealed != plaintext)
        #expect(try MessageCrypto.openRaw(sealed, using: key) == plaintext)
    }

    @Test func sealRawIsTheBytesBehindSeal() throws {
        // seal == base64(sealRaw): both wrap AES.GCM combined output.
        let plaintext = Data("hello".utf8)
        let raw = try MessageCrypto.sealRaw(plaintext, using: key)
        #expect(try MessageCrypto.open(raw.base64EncodedString(), using: key) == plaintext)
    }

    @Test func openRawRejectsTamperedBytes() throws {
        var sealed = try MessageCrypto.sealRaw(Data("secret".utf8), using: key)
        sealed[sealed.count - 1] ^= 0xFF // flip a tag bit
        #expect(throws: (any Error).self) {
            _ = try MessageCrypto.openRaw(sealed, using: key)
        }
    }
}

@Suite("AppPayload image")
struct AppPayloadImageTests {
    @Test func imageRoundTripsThroughJSON() throws {
        let thumb = Data((0..<2048).map { UInt8(($0 * 7) & 0xFF) })
        let item = ImageItem(r2Key: "Zm9vYmFy_key-01", mime: "image/png", width: 1920, height: 1080, byteLen: 524_288, thumb: thumb)
        let payload = AppPayload.image(items: [item], caption: "deploy is green 🚀", sentAt: Date(timeIntervalSince1970: 1_700_000_000))

        let decoded = try AppPayload.decoded(from: payload.encoded())
        guard case let .image(items, caption, sentAt) = decoded else {
            Issue.record("expected .image, got \(decoded)")
            return
        }
        #expect(items == [item])
        #expect(caption == "deploy is green 🚀")
        // ISO-8601 encoding is whole-second; allow that rounding.
        #expect(abs(sentAt.timeIntervalSince1970 - 1_700_000_000) < 1)
    }

    @Test func imageAlbumClampsToMaxAndKeepsOrder() throws {
        let items = (0..<15).map {
            ImageItem(r2Key: "key-\($0)", mime: "image/jpeg", width: 10, height: 10, byteLen: 99, thumb: Data([UInt8($0)]))
        }
        let payload = AppPayload.image(items: items, caption: "", sentAt: Date(timeIntervalSince1970: 1_700_000_000))
        let decoded = try AppPayload.decoded(from: payload.encoded())
        guard case let .image(decodedItems, _, _) = decoded else {
            Issue.record("expected .image, got \(decoded)")
            return
        }
        #expect(decodedItems.count == AppPayload.maxImagesPerMessage)
        #expect(decodedItems.first?.r2Key == "key-0")
        #expect(decodedItems.last?.r2Key == "key-\(AppPayload.maxImagesPerMessage - 1)")
    }

    @Test func imageWithoutCaptionDecodesToEmpty() throws {
        // A pointer omitting `caption` (e.g. the TS dev client) must still
        // decode, with an empty caption.
        let json = Data(#"{"kind":"image","items":[{"r2Key":"abc1234567890def","mime":"image/png","width":1,"height":1,"byteLen":10,"thumb":""}],"sentAt":"2023-11-14T22:13:20Z"}"#.utf8)
        let decoded = try AppPayload.decoded(from: json)
        guard case let .image(items, caption, _) = decoded else {
            Issue.record("expected .image, got \(decoded)")
            return
        }
        #expect(items.count == 1)
        #expect(caption == "")
    }

    @Test func unknownKindThrowsSoCallersCanDrop() {
        let json = Data(#"{"kind":"future-thing","payload":"x"}"#.utf8)
        #expect(throws: (any Error).self) {
            _ = try AppPayload.decoded(from: json)
        }
    }
}

@Suite("BlobClient base URL")
struct BlobClientURLTests {
    @Test func derivesHTTPSFromWSS() {
        let base = BlobClient.baseURL(fromRelay: URL(string: "wss://relay.munkel.app")!)
        #expect(base?.absoluteString == "https://relay.munkel.app")
    }

    @Test func derivesHTTPFromWSAndStripsPathAndQuery() {
        let base = BlobClient.baseURL(fromRelay: URL(string: "ws://127.0.0.1:8787/ws?group=abc")!)
        #expect(base?.absoluteString == "http://127.0.0.1:8787")
    }

    @Test func rejectsNonWebSocketScheme() {
        #expect(BlobClient.baseURL(fromRelay: URL(string: "ftp://example.com")!) == nil)
    }
}

@Suite("AppPayload album budgets & relay cap")
struct AppPayloadAlbumTests {
    /// The relay's MAX_PAYLOAD_CHARS (apps/server/src/protocol.ts) — no shared
    /// Swift constant exists, so it's pinned here.
    private let maxPayloadChars = 48 * 1024
    private let messageKey = GroupKey(code: "blue-table-42").messageKey

    @Test func perThumbBudgetScalesAndFloors() {
        #expect(AppPayload.perThumbBudget(imageCount: 1) == 16_384)
        #expect(AppPayload.perThumbBudget(imageCount: 8) == 2_048)
        #expect(AppPayload.perThumbBudget(imageCount: 20) == 1_200) // floor
    }

    @Test func fullEightImageAlbumStaysUnderRelayCap() throws {
        // Saturate each per-image thumb budget and stress the metadata so this
        // is a real ceiling test, not a soft sample.
        let perThumb = AppPayload.perThumbBudget(imageCount: 8)
        let items = (0..<8).map { i in
            ImageItem(
                r2Key: String(repeating: "k", count: 40), mime: "image/avif",
                width: 4096, height: 4096, byteLen: 2_000_000,
                thumb: Data(repeating: UInt8(i), count: perThumb)
            )
        }
        let payload = AppPayload.image(items: items, caption: String(repeating: "x", count: 256), sentAt: Date(timeIntervalSince1970: 1_700_000_000))
        let sealed = try MessageCrypto.seal(payload.encoded(), using: messageKey)
        #expect(sealed.count <= maxPayloadChars)
    }
}
