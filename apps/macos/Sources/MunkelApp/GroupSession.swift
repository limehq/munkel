import Foundation
import MunkelKit

/// One joined group: holds the relay connection, decrypts incoming payloads,
/// tracks presence and exchanges profile payloads.
@MainActor
final class GroupSession {
    struct Member: Identifiable, Equatable {
        let id: String
        var displayName: String? = nil
        var avatar: Data? = nil

        var label: String {
            displayName ?? String(id.prefix(8))
        }
    }

    /// Upper bound for peer-sent avatar bytes; anything larger is dropped
    /// (the name is kept). Senders stay below this via AvatarCodec.
    private static let maxIncomingAvatarBytes = 32_768

    let code: String
    private(set) var members: [Member] = []
    private(set) var isConnected = false

    private let key: GroupKey
    private let client: RelayClient
    private var eventTask: Task<Void, Never>?

    /// Called on any presence/connection change so the UI can refresh.
    var onStateChange: (() -> Void)?
    /// Called when a chat message arrives; `isDirect` distinguishes a
    /// private message (relay `to` set) from a group broadcast.
    var onChat: ((_ sender: Member, _ text: String, _ isDirect: Bool) -> Void)?

    init(code: String, relayURL: URL) {
        self.code = code
        self.key = GroupKey(code: code)
        self.client = RelayClient(relayURL: relayURL, groupId: key.groupId, memberId: Identity.memberId)
    }

    func start() {
        eventTask = Task { [weak self] in
            guard let client = self?.client else { return }
            await client.start()
            for await event in client.events {
                guard let self else { return }
                await self.handle(event)
            }
        }
    }

    func stop() {
        eventTask?.cancel()
        Task { await client.close() }
    }

    @discardableResult
    func sendChat(_ text: String, to memberId: String? = nil) async -> Bool {
        let payload = AppPayload.chat(text: MessageLimits.clamp(text), sentAt: Date())
        return await send(payload, to: memberId)
    }

    @discardableResult
    func sendProfile(to memberId: String? = nil) async -> Bool {
        let payload = AppPayload.profile(
            displayName: Identity.displayName,
            avatar: Identity.avatarData
        )
        return await send(payload, to: memberId)
    }

    private func send(_ payload: AppPayload, to memberId: String?) async -> Bool {
        do {
            let sealed = try MessageCrypto.seal(payload.encoded(), using: key.messageKey)
            try await client.send(.send(payload: sealed, to: memberId))
            return true
        } catch {
            NSLog("munkel: send failed in \(code): \(error)")
            return false
        }
    }

    private func handle(_ event: RelayClient.Event) async {
        switch event {
        case .disconnected:
            isConnected = false
            onStateChange?()

        case let .received(message):
            switch message {
            case let .welcome(memberIds):
                isConnected = true
                // Merge instead of reset: a welcome also arrives on every
                // reconnect, and peers never re-introduce themselves to us —
                // resetting would wipe known names and avatars for good.
                // Tolerant of duplicate ids: the member list comes from the
                // (untrusted) relay, and trapping here would be a remote DoS.
                let known = Dictionary(
                    members.map { ($0.id, $0) },
                    uniquingKeysWith: { first, _ in first }
                )
                var seen = Set<String>()
                members = memberIds
                    .filter { seen.insert($0).inserted }
                    .map { known[$0] ?? Member(id: $0) }
                onStateChange?()
                await sendProfile()

            case let .peerJoined(memberId):
                if !members.contains(where: { $0.id == memberId }) {
                    members.append(Member(id: memberId))
                }
                onStateChange?()
                // Introduce ourselves directly to the newcomer.
                await sendProfile(to: memberId)

            case let .peerLeft(memberId):
                members.removeAll { $0.id == memberId }
                onStateChange?()

            case let .message(from, to, payload):
                handleIncoming(from: from, to: to, payload: payload)

            case .pong:
                break

            case let .error(code, message):
                NSLog("munkel: relay error in \(self.code): \(code) \(message)")
            }
        }
    }

    private func handleIncoming(from memberId: String, to: String?, payload: String) {
        guard let plaintext = try? MessageCrypto.open(payload, using: key.messageKey) else {
            NSLog("munkel: dropping undecryptable payload in \(code)")
            return
        }
        let decoded: AppPayload
        do {
            decoded = try AppPayload.decoded(from: plaintext)
        } catch {
            NSLog("munkel: dropping malformed payload in \(code): \(error)")
            return
        }

        switch decoded {
        case let .profile(displayName, avatar):
            // nil clears the avatar (peer logged out of GitHub).
            let sanitizedAvatar = avatar.flatMap {
                $0.count <= Self.maxIncomingAvatarBytes ? $0 : nil
            }
            if let index = members.firstIndex(where: { $0.id == memberId }) {
                members[index].displayName = displayName
                members[index].avatar = sanitizedAvatar
            } else {
                members.append(
                    Member(id: memberId, displayName: displayName, avatar: sanitizedAvatar)
                )
            }
            onStateChange?()

        case let .chat(text, _):
            let sender = members.first { $0.id == memberId }
                ?? Member(id: memberId)
            onChat?(sender, MessageLimits.clamp(text), to != nil)
        }
    }
}
