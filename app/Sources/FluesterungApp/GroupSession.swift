import Foundation
import FluesterungKit

/// One joined group: holds the relay connection, decrypts incoming payloads,
/// tracks presence and exchanges profile payloads.
@MainActor
final class GroupSession {
    struct Member: Identifiable, Equatable {
        let id: String
        var displayName: String?

        var label: String {
            displayName ?? String(id.prefix(8))
        }
    }

    let code: String
    private(set) var members: [Member] = []
    private(set) var isConnected = false

    private let key: GroupKey
    private let client: RelayClient
    private var eventTask: Task<Void, Never>?

    /// Called on any presence/connection change so the UI can refresh.
    var onStateChange: (() -> Void)?
    /// Called with sender label and text when a chat message arrives.
    var onChat: ((_ sender: Member, _ text: String) -> Void)?

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
        let payload = AppPayload.chat(text: text, sentAt: Date())
        return await send(payload, to: memberId)
    }

    @discardableResult
    func sendProfile(to memberId: String? = nil) async -> Bool {
        let payload = AppPayload.profile(displayName: Identity.displayName, avatar: nil)
        return await send(payload, to: memberId)
    }

    private func send(_ payload: AppPayload, to memberId: String?) async -> Bool {
        do {
            let sealed = try MessageCrypto.seal(payload.encoded(), using: key.messageKey)
            try await client.send(.send(payload: sealed, to: memberId))
            return true
        } catch {
            NSLog("fluesterung: send failed in \(code): \(error)")
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
                members = memberIds.map { Member(id: $0, displayName: nil) }
                onStateChange?()
                await sendProfile()

            case let .peerJoined(memberId):
                if !members.contains(where: { $0.id == memberId }) {
                    members.append(Member(id: memberId, displayName: nil))
                }
                onStateChange?()
                // Introduce ourselves directly to the newcomer.
                await sendProfile(to: memberId)

            case let .peerLeft(memberId):
                members.removeAll { $0.id == memberId }
                onStateChange?()

            case let .message(from, _, payload):
                handleIncoming(from: from, payload: payload)

            case .pong:
                break

            case let .error(code, message):
                NSLog("fluesterung: relay error in \(self.code): \(code) \(message)")
            }
        }
    }

    private func handleIncoming(from memberId: String, payload: String) {
        guard let plaintext = try? MessageCrypto.open(payload, using: key.messageKey) else {
            NSLog("fluesterung: dropping undecryptable payload in \(code)")
            return
        }
        let decoded: AppPayload
        do {
            decoded = try AppPayload.decoded(from: plaintext)
        } catch {
            NSLog("fluesterung: dropping malformed payload in \(code): \(error)")
            return
        }

        switch decoded {
        case let .profile(displayName, _):
            if let index = members.firstIndex(where: { $0.id == memberId }) {
                members[index].displayName = displayName
            } else {
                members.append(Member(id: memberId, displayName: displayName))
            }
            onStateChange?()

        case let .chat(text, _):
            let sender = members.first { $0.id == memberId }
                ?? Member(id: memberId, displayName: nil)
            onChat?(sender, text)
        }
    }
}
