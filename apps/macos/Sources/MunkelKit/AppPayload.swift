import Foundation

/// One image of an album. The full-resolution AVIF is always sealed and
/// uploaded to R2 under `r2Key`, and only this pointer is relayed; `thumb` is a
/// tiny inline AVIF (a couple of KiB) so the notch paints instantly while the
/// full image lazy-loads from R2. `width`/`height` are the full image's pixel
/// size (for aspect ratio); `byteLen` is the sealed blob's size (informational
/// only — never used to bound the download).
public struct ImageItem: Codable, Sendable, Equatable {
    public let r2Key: String
    public let mime: String
    public let width: Int
    public let height: Int
    public let byteLen: Int
    public let thumb: Data

    public init(r2Key: String, mime: String, width: Int, height: Int, byteLen: Int, thumb: Data) {
        self.r2Key = r2Key
        self.mime = mime
        self.width = width
        self.height = height
        self.byteLen = byteLen
        self.thumb = thumb
    }
}

/// What lives inside the encrypted blob — the relay never sees these.
public enum AppPayload: Sendable, Equatable {
    case chat(text: String, sentAt: Date)
    case profile(displayName: String, avatar: Data?)
    /// One or more images (an album) sent together, with an optional shared
    /// `caption` ("" if none). Each `ImageItem` is a pointer to an R2 blob plus
    /// a tiny inline preview thumbnail.
    case image(items: [ImageItem], caption: String, sentAt: Date)

    /// Hard cap on images per message; senders clamp, receivers drop extras.
    public static let maxImagesPerMessage = 8

    /// Total raw bytes for inline preview thumbnails across an album, shared so
    /// the sealed pointer stays under the relay's 48 KiB payload cap even at the
    /// 8-image max. The single source of truth (dev-image.ts mirrors it).
    public static let albumThumbBudget = 16_384

    /// Per-image inline thumbnail byte budget for a `count`-image album.
    public static func perThumbBudget(imageCount: Int) -> Int {
        max(1_200, albumThumbBudget / max(1, imageCount))
    }
}

extension AppPayload: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, text, sentAt, displayName, avatar
        case items, caption
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try container.decode(String.self, forKey: .kind)
        switch kind {
        case "chat":
            let sentAtRaw = try container.decode(String.self, forKey: .sentAt)
            guard let sentAt = Self.parseISO8601(sentAtRaw) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .sentAt,
                    in: container,
                    debugDescription: "sentAt is not ISO-8601"
                )
            }
            self = try .chat(text: container.decode(String.self, forKey: .text), sentAt: sentAt)
        case "profile":
            self = try .profile(
                displayName: container.decode(String.self, forKey: .displayName),
                avatar: container.decodeIfPresent(Data.self, forKey: .avatar)
            )
        case "image":
            let sentAtRaw = try container.decode(String.self, forKey: .sentAt)
            guard let sentAt = Self.parseISO8601(sentAtRaw) else {
                throw DecodingError.dataCorruptedError(
                    forKey: .sentAt,
                    in: container,
                    debugDescription: "sentAt is not ISO-8601"
                )
            }
            // Drop extras past the cap rather than rejecting (the list comes
            // from an untrusted peer).
            let items = try container.decode([ImageItem].self, forKey: .items)
            self = try .image(
                items: Array(items.prefix(Self.maxImagesPerMessage)),
                caption: container.decodeIfPresent(String.self, forKey: .caption) ?? "",
                sentAt: sentAt
            )
        default:
            // Forward-compat: a newer peer may send a kind this build doesn't
            // know. The caller (GroupSession.handleIncoming) catches this and
            // drops the frame — better than crashing — so an outdated client
            // simply ignores message kinds it can't render.
            throw DecodingError.dataCorruptedError(
                forKey: .kind,
                in: container,
                debugDescription: "Unknown payload kind: \(kind)"
            )
        }
    }

    /// Liberal in what we accept: JavaScript's `toISOString()` emits
    /// fractional seconds, Swift's formatter emits whole seconds.
    private static func parseISO8601(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .chat(text, sentAt):
            try container.encode("chat", forKey: .kind)
            try container.encode(text, forKey: .text)
            try container.encode(ISO8601DateFormatter().string(from: sentAt), forKey: .sentAt)
        case let .profile(displayName, avatar):
            try container.encode("profile", forKey: .kind)
            try container.encode(displayName, forKey: .displayName)
            try container.encodeIfPresent(avatar, forKey: .avatar)
        case let .image(items, caption, sentAt):
            try container.encode("image", forKey: .kind)
            try container.encode(items, forKey: .items)
            try container.encode(caption, forKey: .caption)
            try container.encode(ISO8601DateFormatter().string(from: sentAt), forKey: .sentAt)
        }
    }
}

public extension AppPayload {
    func encoded() throws -> Data {
        try JSONEncoder().encode(self)
    }

    static func decoded(from data: Data) throws -> AppPayload {
        try JSONDecoder().decode(AppPayload.self, from: data)
    }
}
