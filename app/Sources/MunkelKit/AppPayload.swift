import Foundation

/// What lives inside the encrypted blob — the relay never sees these.
public enum AppPayload: Sendable, Equatable {
    case chat(text: String, sentAt: Date)
    case profile(displayName: String, avatar: Data?)
}

extension AppPayload: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, text, sentAt, displayName, avatar
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
        default:
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
