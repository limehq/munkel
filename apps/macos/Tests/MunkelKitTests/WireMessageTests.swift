import Foundation
import Testing
@testable import MunkelKit

@Suite("Wire protocol coding")
struct WireMessageTests {
    @Test func encodesBroadcastSend() throws {
        let data = try JSONEncoder().encode(ClientMessage.send(payload: "abc", to: nil))
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["type"] as? String == "send")
        #expect(json["payload"] as? String == "abc")
        #expect(json["to"] == nil)
    }

    @Test func encodesDirectSend() throws {
        let data = try JSONEncoder().encode(ClientMessage.send(payload: "abc", to: "bob"))
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["to"] as? String == "bob")
    }

    @Test func encodesPing() throws {
        let data = try JSONEncoder().encode(ClientMessage.ping)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["type"] as? String == "ping")
    }

    @Test func decodesWelcome() throws {
        let message = try JSONDecoder().decode(
            ServerMessage.self,
            from: Data(#"{"type":"welcome","members":["alice","bob"]}"#.utf8)
        )
        #expect(message == .welcome(members: ["alice", "bob"]))
    }

    @Test func decodesPresenceFrames() throws {
        let joined = try JSONDecoder().decode(
            ServerMessage.self,
            from: Data(#"{"type":"peer-joined","memberId":"carol"}"#.utf8)
        )
        #expect(joined == .peerJoined(memberId: "carol"))

        let left = try JSONDecoder().decode(
            ServerMessage.self,
            from: Data(#"{"type":"peer-left","memberId":"carol"}"#.utf8)
        )
        #expect(left == .peerLeft(memberId: "carol"))
    }

    @Test func decodesMessageWithAndWithoutRecipient() throws {
        let broadcast = try JSONDecoder().decode(
            ServerMessage.self,
            from: Data(#"{"type":"message","from":"alice","payload":"abc"}"#.utf8)
        )
        #expect(broadcast == .message(from: "alice", to: nil, payload: "abc"))

        let direct = try JSONDecoder().decode(
            ServerMessage.self,
            from: Data(#"{"type":"message","from":"alice","to":"bob","payload":"abc"}"#.utf8)
        )
        #expect(direct == .message(from: "alice", to: "bob", payload: "abc"))
    }

    @Test func decodesError() throws {
        let message = try JSONDecoder().decode(
            ServerMessage.self,
            from: Data(#"{"type":"error","code":"unknown-recipient","message":"nope"}"#.utf8)
        )
        #expect(message == .error(code: "unknown-recipient", message: "nope"))
    }

    @Test func rejectsUnknownType() {
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(ServerMessage.self, from: Data(#"{"type":"join"}"#.utf8))
        }
    }
}

@Suite("App payload coding")
struct AppPayloadTests {
    @Test func chatRoundtrip() throws {
        let sentAt = Date(timeIntervalSince1970: 1_750_000_000)
        let payload = AppPayload.chat(text: "Kaffee?", sentAt: sentAt)
        let decoded = try AppPayload.decoded(from: payload.encoded())
        #expect(decoded == payload)
    }

    @Test func profileRoundtrip() throws {
        let payload = AppPayload.profile(displayName: "Anna", avatar: Data([1, 2, 3]))
        let decoded = try AppPayload.decoded(from: payload.encoded())
        #expect(decoded == payload)
    }

    @Test func chatDecodesJavaScriptFractionalSeconds() throws {
        let json = #"{"kind":"chat","text":"hi","sentAt":"2026-06-11T15:07:00.123Z"}"#
        let decoded = try AppPayload.decoded(from: Data(json.utf8))
        guard case let .chat(text, sentAt) = decoded else {
            Issue.record("expected chat payload")
            return
        }
        #expect(text == "hi")
        #expect(abs(sentAt.timeIntervalSince1970 - 1_781_190_420.123) < 0.001)
    }

    @Test func chatEncodesKindAndIsoDate() throws {
        let data = try AppPayload.chat(text: "hi", sentAt: Date(timeIntervalSince1970: 0)).encoded()
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["kind"] as? String == "chat")
        #expect(json["sentAt"] as? String == "1970-01-01T00:00:00Z")
    }

    @Test func profileWithoutAvatarOmitsKey() throws {
        let data = try AppPayload.profile(displayName: "Anna", avatar: nil).encoded()
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["avatar"] == nil)
    }

    @Test func profileDecodesMissingAvatarAsNil() throws {
        let decoded = try AppPayload.decoded(
            from: Data(#"{"kind":"profile","displayName":"Anna"}"#.utf8)
        )
        #expect(decoded == .profile(displayName: "Anna", avatar: nil))
    }

    @Test func profileAvatarEncodesAsBase64String() throws {
        let bytes = Data([0xFF, 0xD8, 0xFF, 0xE0])
        let data = try AppPayload.profile(displayName: "Anna", avatar: bytes).encoded()
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        let base64 = try #require(json["avatar"] as? String)
        #expect(Data(base64Encoded: base64) == bytes)
    }
}
