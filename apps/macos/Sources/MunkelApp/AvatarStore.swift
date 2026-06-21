import Foundation
import MunkelKit

actor AvatarStore {
    static let shared = AvatarStore()

    private var cache: [String: Data] = [:]
    private var inflight: [String: Task<Data?, Never>] = [:]

    func image(for urlString: String) async -> Data? {
        if let cached = cache[urlString] { return cached }
        if let existing = inflight[urlString] { return await existing.value }
        let task = Task<Data?, Never> { await Self.download(urlString) }
        inflight[urlString] = task
        let result = await task.value
        inflight[urlString] = nil
        if let result { cache[urlString] = result }
        return result
    }

    private static let maxDownloadBytes = 4 * 1024 * 1024

    private static func download(_ urlString: String) async -> Data? {
        guard let url = URL(string: urlString), isAllowedHost(url) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("munkel", forHTTPHeaderField: "User-Agent")
        guard
            let (data, response) = try? await URLSession.shared.data(for: request),
            let http = response as? HTTPURLResponse,
            http.statusCode == 200,
            data.count <= maxDownloadBytes
        else { return nil }
        return AvatarCodec.makeAvatar(from: data)
    }

    private static func isAllowedHost(_ url: URL) -> Bool {
        guard url.scheme == "https", let host = url.host?.lowercased() else { return false }
        return host == "avatars.githubusercontent.com" || host.hasSuffix(".githubusercontent.com")
    }
}
