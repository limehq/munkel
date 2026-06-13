import CryptoKit
import Foundation
import Testing
@testable import MunkelKit

@Suite("GroupKey derivation")
struct GroupKeyTests {
    @Test func groupIdIs32LowercaseHexChars() {
        let key = GroupKey(code: "blue-table-42")
        #expect(key.groupId.count == 32)
        #expect(key.groupId.allSatisfy { "0123456789abcdef".contains($0) })
    }

    @Test func derivationIsDeterministic() {
        #expect(GroupKey(code: "blue-table-42").groupId == GroupKey(code: "blue-table-42").groupId)
    }

    /// Pinned cross-implementation vector, computed independently by the
    /// WebCrypto implementation in server/scripts/dev-send.ts.
    @Test func interopVectorMatchesTypeScript() {
        #expect(GroupKey(code: "blue-table-42").groupId == "aaf5dc7308fe4bede46cdebc9390813d")
    }

    @Test func normalizationFoldsCaseAndWhitespace() {
        let reference = GroupKey(code: "blue-table-42")
        #expect(GroupKey(code: "  Blue-Table-42\n").groupId == reference.groupId)
    }

    @Test func differentCodesYieldDifferentGroups() {
        #expect(GroupKey(code: "blue-table-42").groupId != GroupKey(code: "blue-table-43").groupId)
    }

    @Test func messageKeyDiffersFromGroupId() {
        let key = GroupKey(code: "blue-table-42")
        let messageKeyHex = key.messageKey.withUnsafeBytes { buffer in
            buffer.map { String(format: "%02x", $0) }.joined()
        }
        #expect(!messageKeyHex.hasPrefix(key.groupId))
    }
}

@Suite("MessageCrypto")
struct MessageCryptoTests {
    @Test func sealOpenRoundtrip() throws {
        let key = GroupKey(code: "blue-table-42").messageKey
        let plaintext = Data("coffee?".utf8)
        let payload = try MessageCrypto.seal(plaintext, using: key)
        let opened = try MessageCrypto.open(payload, using: key)
        #expect(opened == plaintext)
    }

    @Test func openFailsWithWrongKey() throws {
        let payload = try MessageCrypto.seal(Data("secret".utf8), using: GroupKey(code: "blue-table-42").messageKey)
        #expect(throws: (any Error).self) {
            try MessageCrypto.open(payload, using: GroupKey(code: "anderer-code").messageKey)
        }
    }

    @Test func openFailsOnTamperedCiphertext() throws {
        let key = GroupKey(code: "blue-table-42").messageKey
        let payload = try MessageCrypto.seal(Data("secret".utf8), using: key)
        var combined = Data(base64Encoded: payload)!
        combined[combined.count - 1] ^= 0xFF
        #expect(throws: (any Error).self) {
            try MessageCrypto.open(combined.base64EncodedString(), using: key)
        }
    }

    @Test func payloadLayoutIsNoncePlusCiphertextPlusTag() throws {
        let key = GroupKey(code: "blue-table-42").messageKey
        let plaintext = Data("12345".utf8)
        let combined = Data(base64Encoded: try MessageCrypto.seal(plaintext, using: key))!
        #expect(combined.count == 12 + plaintext.count + 16)
    }
}
