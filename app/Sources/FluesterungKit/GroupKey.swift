import CryptoKit
import Foundation

/// Everything a group derives from its human-readable code, per PROTOCOL.md:
/// the code never leaves the client; the relay only ever sees `groupId`.
public struct GroupKey: Sendable {
    public let groupId: String
    public let messageKey: SymmetricKey

    private static let salt = Data("fluesterung-v1".utf8)

    public init(code: String) {
        let normalized = Self.normalize(code)
        let inputKeyMaterial = SymmetricKey(data: Data(normalized.utf8))

        let groupIdKey = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: inputKeyMaterial,
            salt: Self.salt,
            info: Data("group-id".utf8),
            outputByteCount: 16
        )
        self.groupId = groupIdKey.withUnsafeBytes { buffer in
            buffer.map { String(format: "%02x", $0) }.joined()
        }

        self.messageKey = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: inputKeyMaterial,
            salt: Self.salt,
            info: Data("message-key".utf8),
            outputByteCount: 32
        )
    }

    /// Spec normalization: Unicode NFC, trim, lowercase.
    public static func normalize(_ code: String) -> String {
        code.precomposedStringWithCanonicalMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }
}
