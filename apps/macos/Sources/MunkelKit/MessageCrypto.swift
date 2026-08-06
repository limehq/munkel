import CryptoKit
import Foundation

public enum CryptoError: Error {
    case sealFailed
    case invalidPayload
}

/// AES-256-GCM payload encryption per the wire protocol spec
/// (apps/server/src/protocol.ts):
/// `payload = base64( nonce[12] ‖ ciphertext ‖ tag[16] )`, empty AAD.
public enum MessageCrypto {
    public static func seal(_ plaintext: Data, using key: SymmetricKey) throws -> String {
        try seal(plaintext, using: key, nonce: AES.GCM.Nonce())
    }

    /// Deterministic seal for cross-platform interop tests (Swift ↔ Windows).
    /// Production code should use `seal(_:using:)` with a random nonce.
    public static func seal(_ plaintext: Data, using key: SymmetricKey, nonce: AES.GCM.Nonce) throws -> String {
        try sealRaw(plaintext, using: key, nonce: nonce).base64EncodedString()
    }

    public static func open(_ payload: String, using key: SymmetricKey) throws -> Data {
        guard let combined = Data(base64Encoded: payload) else {
            throw CryptoError.invalidPayload
        }
        return try openRaw(combined, using: key)
    }

    /// Same sealing as `seal`, but returns the raw `combined` bytes
    /// (nonce ‖ ciphertext ‖ tag) instead of base64. Used for image blobs
    /// stored in R2, where base64 would waste ~33% of storage and egress.
    public static func sealRaw(_ plaintext: Data, using key: SymmetricKey) throws -> Data {
        try sealRaw(plaintext, using: key, nonce: AES.GCM.Nonce())
    }

    /// Deterministic raw seal for cross-platform interop tests.
    public static func sealRaw(_ plaintext: Data, using key: SymmetricKey, nonce: AES.GCM.Nonce) throws -> Data {
        let sealedBox = try AES.GCM.seal(plaintext, using: key, nonce: nonce)
        guard let combined = sealedBox.combined else {
            throw CryptoError.sealFailed
        }
        return combined
    }

    /// Inverse of `sealRaw`: opens raw `combined` bytes.
    public static func openRaw(_ combined: Data, using key: SymmetricKey) throws -> Data {
        let sealedBox = try AES.GCM.SealedBox(combined: combined)
        return try AES.GCM.open(sealedBox, using: key)
    }
}
