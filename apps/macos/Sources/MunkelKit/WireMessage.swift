import Foundation

/// Client → server frames, per the wire protocol spec
/// (apps/server/src/protocol.ts).
public enum ClientMessage: Sendable, Equatable {
    case send(payload: String, to: String?)
    case ping
}

extension ClientMessage: Encodable {
    private enum CodingKeys: String, CodingKey {
        case type, payload, to
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .send(payload, to):
            try container.encode("send", forKey: .type)
            try container.encode(payload, forKey: .payload)
            try container.encodeIfPresent(to, forKey: .to)
        case .ping:
            try container.encode("ping", forKey: .type)
        }
    }
}

/// Server → client frames, per the wire protocol spec
/// (apps/server/src/protocol.ts).
public enum ServerMessage: Sendable, Equatable {
    case welcome(members: [String])
    case peerJoined(memberId: String)
    case peerLeft(memberId: String)
    case message(from: String, to: String?, payload: String)
    case pong
    case error(code: String, message: String)
}

extension ServerMessage: Decodable {
    private enum CodingKeys: String, CodingKey {
        case type, members, memberId, from, to, payload, code, message
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "welcome":
            self = try .welcome(members: container.decode([String].self, forKey: .members))
        case "peer-joined":
            self = try .peerJoined(memberId: container.decode(String.self, forKey: .memberId))
        case "peer-left":
            self = try .peerLeft(memberId: container.decode(String.self, forKey: .memberId))
        case "message":
            self = try .message(
                from: container.decode(String.self, forKey: .from),
                to: container.decodeIfPresent(String.self, forKey: .to),
                payload: container.decode(String.self, forKey: .payload)
            )
        case "pong":
            self = .pong
        case "error":
            self = try .error(
                code: container.decode(String.self, forKey: .code),
                message: container.decode(String.self, forKey: .message)
            )
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unknown server message type: \(type)"
            )
        }
    }
}
