import Foundation

public enum BlobError: Error, Equatable {
    case badRelayURL
    case uploadFailed(status: Int)
    case downloadFailed(status: Int)
    case tooLarge
}

/// HTTP client for image blobs stored in R2 behind the relay Worker. The full
/// image is sealed by the caller BEFORE upload (see MessageCrypto.sealRaw), so
/// only opaque ciphertext crosses this client — the server stays blind.
///
/// The blob endpoint shares the relay's origin: the relay is reached over
/// `ws(s)://host/ws`, blobs over `http(s)://host/blob/<group>/<key>`.
public actor BlobClient {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    /// Same-origin HTTPS base for blobs, derived from the ws(s) relay URL.
    public static func baseURL(fromRelay relayURL: URL) -> URL? {
        guard var components = URLComponents(url: relayURL, resolvingAgainstBaseURL: false) else {
            return nil
        }
        switch components.scheme?.lowercased() {
        case "wss", "https": components.scheme = "https"
        case "ws", "http": components.scheme = "http"
        default: return nil
        }
        components.path = ""
        components.query = nil
        components.fragment = nil
        return components.url
    }

    /// PUT the sealed ciphertext. Throws on any non-2xx status.
    public func upload(baseURL: URL, group: String, key: String, ciphertext: Data) async throws {
        var request = URLRequest(url: blobURL(baseURL: baseURL, group: group, key: key))
        request.httpMethod = "PUT"
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let (_, response) = try await session.upload(for: request, from: ciphertext)
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(status) else {
            throw BlobError.uploadFailed(status: status)
        }
    }

    /// GET the sealed ciphertext. Throws `.downloadFailed(404)` once the blob
    /// has expired or was never uploaded.
    public func download(baseURL: URL, group: String, key: String, maxBytes: Int? = nil) async throws -> Data {
        let request = URLRequest(url: blobURL(baseURL: baseURL, group: group, key: key))
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(status) else {
            throw BlobError.downloadFailed(status: status)
        }
        if let maxBytes, data.count > maxBytes {
            throw BlobError.tooLarge
        }
        return data
    }

    private func blobURL(baseURL: URL, group: String, key: String) -> URL {
        baseURL
            .appending(path: "blob")
            .appending(path: group)
            .appending(path: key)
    }
}
