import Foundation

/// Open Graph metadata scraped from a linked page: a title and an optional
/// share image. Just enough to draw a small card under a message; absent
/// fields fall back gracefully (no title means no card at all).
public struct LinkPreviewData: Equatable, Sendable {
    public let url: URL
    public let title: String
    public let imageURL: URL?
    public let siteName: String?

    public init(url: URL, title: String, imageURL: URL?, siteName: String?) {
        self.url = url
        self.title = title
        self.imageURL = imageURL
        self.siteName = siteName
    }
}

/// Fetches a page once, parses its Open Graph tags, and caches the result per
/// URL so the same link is never scraped twice. Failures (no OG data, offline,
/// non-HTML, oversized) resolve to nil — the caller simply shows no card.
public actor LinkPreviewFetcher {
    public static let shared = LinkPreviewFetcher()

    /// Cap the page download so a hostile or huge response can't blow up memory.
    /// OG tags live in <head>, so the first chunk is plenty.
    private static let maxBytes = 512 * 1024

    private let session: URLSession
    private var cache: [URL: LinkPreviewData?] = [:]
    private var inFlight: [URL: Task<LinkPreviewData?, Never>] = [:]

    public init(session: URLSession = .shared) {
        self.session = session
    }

    /// Resolve the preview for `url`, scraping at most once. Concurrent callers
    /// for the same URL share a single fetch.
    public func preview(for url: URL) async -> LinkPreviewData? {
        if let cached = cache[url] { return cached }
        if let task = inFlight[url] { return await task.value }

        let task = Task<LinkPreviewData?, Never> { [session] in
            await Self.scrape(url, session: session)
        }
        inFlight[url] = task
        let result = await task.value
        inFlight[url] = nil
        cache[url] = result
        return result
    }

    private static func scrape(_ url: URL, session: URLSession) async -> LinkPreviewData? {
        var request = URLRequest(url: url, timeoutInterval: 8)
        // A browser-ish UA: some sites serve bare/blocked markup to unknown agents.
        request.setValue(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
            forHTTPHeaderField: "User-Agent"
        )
        guard let (data, response) = try? await session.data(for: request) else { return nil }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            return nil
        }
        if let type = http.value(forHTTPHeaderField: "Content-Type"),
           !type.lowercased().contains("html") {
            return nil
        }
        let head = data.prefix(maxBytes)
        let encoding = http.textEncodingName.flatMap { name in
            let cf = CFStringConvertIANACharSetNameToEncoding(name as CFString)
            return cf == kCFStringEncodingInvalidId
                ? nil
                : String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(cf))
        } ?? .utf8
        guard let html = String(data: head, encoding: encoding) ?? String(data: head, encoding: .utf8) else {
            return nil
        }
        return parse(html, base: http.url ?? url)
    }

    /// Pull og:title / og:image (falling back to <title>) out of raw HTML with a
    /// regex sweep over <meta> tags. Good enough for a preview card — we don't
    /// need a full DOM, and an unparseable page just yields no card.
    static func parse(_ html: String, base: URL) -> LinkPreviewData? {
        let metas = metaTags(in: html)
        let title = metas["og:title"]
            ?? metas["twitter:title"]
            ?? firstTitleTag(in: html)
        guard let title, !title.isEmpty else { return nil }

        let imageURL = (metas["og:image"] ?? metas["twitter:image"])
            .flatMap { URL(string: $0, relativeTo: base)?.absoluteURL }
        let siteName = metas["og:site_name"]

        return LinkPreviewData(url: base, title: title, imageURL: imageURL, siteName: siteName)
    }

    /// Map every <meta> tag's property/name to its decoded content. Order is
    /// preserved by writing only the first occurrence of each key.
    private static func metaTags(in html: String) -> [String: String] {
        var result: [String: String] = [:]
        let pattern = #"<meta\b[^>]*>"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else {
            return result
        }
        let range = NSRange(html.startIndex..., in: html)
        for match in regex.matches(in: html, range: range) {
            guard let tagRange = Range(match.range, in: html) else { continue }
            let tag = String(html[tagRange])
            guard let key = attribute("property", in: tag) ?? attribute("name", in: tag),
                  let content = attribute("content", in: tag) else { continue }
            let lowered = key.lowercased()
            if result[lowered] == nil {
                result[lowered] = decodeEntities(content)
            }
        }
        return result
    }

    private static func firstTitleTag(in html: String) -> String? {
        let pattern = #"<title[^>]*>([\s\S]*?)</title>"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)),
              let range = Range(match.range(at: 1), in: html) else { return nil }
        let raw = html[range].trimmingCharacters(in: .whitespacesAndNewlines)
        return decodeEntities(raw)
    }

    private static func attribute(_ name: String, in tag: String) -> String? {
        let pattern = "\(name)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let match = regex.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)) else {
            return nil
        }
        for index in 1...2 {
            if let range = Range(match.range(at: index), in: tag) {
                return String(tag[range])
            }
        }
        return nil
    }

    /// Decode the handful of HTML entities that show up in titles. Not a full
    /// table — just the common ones, plus numeric escapes.
    private static func decodeEntities(_ text: String) -> String {
        var out = text
        let named = [
            "&amp;": "&", "&lt;": "<", "&gt;": ">",
            "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
        ]
        for (entity, value) in named {
            out = out.replacingOccurrences(of: entity, with: value)
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// The first http(s) URL in a string, if any. Used to decide whether a message
/// gets a link preview card.
public func firstURL(in text: String) -> URL? {
    guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
        return nil
    }
    let range = NSRange(text.startIndex..., in: text)
    for match in detector.matches(in: text, range: range) {
        guard let url = match.url, let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { continue }
        return url
    }
    return nil
}
