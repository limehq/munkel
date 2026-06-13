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
        let sealedBox = try AES.GCM.seal(plaintext, using: key)
        guard let combined = sealedBox.combined else {
            throw CryptoError.sealFailed
        }
        return combined.base64EncodedString()
    }

    public static func open(_ payload: String, using key: SymmetricKey) throws -> Data {
        guard let combined = Data(base64Encoded: payload) else {
            throw CryptoError.invalidPayload
        }
        let sealedBox = try AES.GCM.SealedBox(combined: combined)
        return try AES.GCM.open(sealedBox, using: key)
    }
}
