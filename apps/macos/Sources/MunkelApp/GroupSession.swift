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

    /// Upper bound for a peer-sent inline thumbnail; larger drops the image.
    private static let maxIncomingThumbBytes = 65_536
    /// Upper bound for a fetched full-image blob (sealed ciphertext) — matches
    /// the server's per-blob cap (apps/server/src/blob.ts) plus envelope.
    private static let maxIncomingImageBytes = 3 * 1024 * 1024 + 4_096

    let code: String
    private(set) var members: [Member] = []
    private(set) var isConnected = false

    private let key: GroupKey
    private let client: RelayClient
    private let blobClient = BlobClient()
    /// HTTPS base for image blobs, derived from the relay URL; nil if the
    /// relay URL has an unexpected scheme (image sending then no-ops).
    private let blobBaseURL: URL?
    private var eventTask: Task<Void, Never>?

    /// Called on any presence/connection change so the UI can refresh.
    var onStateChange: (() -> Void)?
    /// Called when a chat message arrives; `isDirect` distinguishes a
    /// private message (relay `to` set) from a group broadcast.
    var onChat: ((_ sender: Member, _ text: String, _ isDirect: Bool) -> Void)?
    /// Called when an image album arrives (1–10 images). `caption` is the
    /// optional shared message (empty if none). `loadFull` fetches + decrypts
    /// one image's full resolution from R2 on demand, keyed by its r2Key
    /// (nil on failure/expiry).
    var onImages: ((_ sender: Member, _ items: [ImageItem], _ caption: String, _ isDirect: Bool, _ loadFull: @escaping @Sendable (String) async -> Data?) -> Void)?

    init(code: String, relayURL: URL) {
        self.code = code
        self.key = GroupKey(code: code)
        self.client = RelayClient(relayURL: relayURL, groupId: key.groupId, memberId: Identity.memberId)
        self.blobBaseURL = BlobClient.baseURL(fromRelay: relayURL)
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

    /// Transcodes each image to AVIF, ALWAYS uploads the sealed ciphertext to R2
    /// (in parallel), then relays ONE pointer listing all of them with their
    /// inline AVIF thumbnails. Encoding + crypto run off the main actor. The
    /// caption is shared by the album; NOT subject to the text length clamp.
    @discardableResult
    func sendImages(_ imageDatas: [Data], caption: String = "", to memberId: String? = nil) async -> Bool {
        guard let blobBaseURL else {
            NSLog("munkel: no blob endpoint for \(code)")
            return false
        }
        let datas = Array(imageDatas.prefix(AppPayload.maxImagesPerMessage))
        guard !datas.isEmpty else { return false }

        let messageKey = key.messageKey
        let perThumbBytes = AppPayload.perThumbBudget(imageCount: datas.count)
        // prepareFull/makeThumbnail/sealRaw are CPU-bound on up to ~2 MiB each —
        // keep them off the main actor. Undecodable images are dropped.
        let prepared = await Task.detached {
            datas.compactMap { data -> (ciphertext: Data, mime: String, width: Int, height: Int, thumb: Data)? in
                guard let full = ImageCodec.prepareFull(from: data),
                      let ciphertext = try? MessageCrypto.sealRaw(full.data, using: messageKey)
                else {
                    return nil
                }
                // Reuse the full AVIF as the inline preview when it already fits
                // the per-image budget; otherwise a small AVIF (same format).
                let thumb = full.data.count <= perThumbBytes
                    ? full.data
                    : ImageCodec.makeThumbnail(from: data, maxBytes: perThumbBytes)
                guard let thumb else { return nil }
                return (ciphertext, full.mime, full.width, full.height, thumb)
            }
        }.value

        guard !prepared.isEmpty else {
            NSLog("munkel: could not prepare any image in \(code) (AVIF encoding available: \(ImageCodec.isAVIFEncodingAvailable))")
            return false
        }

        let base = blobBaseURL
        let groupId = key.groupId
        let client = blobClient
        do {
            // Upload all blobs concurrently; every PUT must finish before the
            // pointer goes out, or a recipient would GET a 404. Order preserved.
            let items = try await withThrowingTaskGroup(of: (Int, ImageItem).self) { group in
                for (index, p) in prepared.enumerated() {
                    let r2Key = Self.makeBlobKey()
                    group.addTask {
                        try await client.upload(baseURL: base, group: groupId, key: r2Key, ciphertext: p.ciphertext)
                        return (index, ImageItem(
                            r2Key: r2Key, mime: p.mime, width: p.width, height: p.height,
                            byteLen: p.ciphertext.count, thumb: p.thumb
                        ))
                    }
                }
                var collected: [(Int, ImageItem)] = []
                for try await pair in group { collected.append(pair) }
                return collected.sorted { $0.0 < $1.0 }.map(\.1)
            }
            guard !items.isEmpty else {
                NSLog("munkel: no image uploaded in \(code)")
                return false
            }
            let payload = AppPayload.image(items: items, caption: MessageLimits.clamp(caption), sentAt: Date())
            return await send(payload, to: memberId)
        } catch {
            NSLog("munkel: image send failed in \(code): \(error)")
            return false
        }
    }

    /// Random, URL-safe object id (matches the server's BLOB_KEY_REGEX).
    private static func makeBlobKey() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
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

        case let .image(items, caption, _):
            // Drop items with an implausibly large inline thumb; the relay
            // frame cap already bounds the total, this guards each one.
            let safeItems = items.filter { $0.thumb.count <= Self.maxIncomingThumbBytes }
            guard !safeItems.isEmpty else {
                NSLog("munkel: dropping image album with no valid items in \(code)")
                return
            }
            let sender = members.first { $0.id == memberId } ?? Member(id: memberId)
            // Capture only Sendable values for the off-actor per-image fetch.
            let base = blobBaseURL
            let groupId = key.groupId
            let messageKey = key.messageKey
            let client = blobClient
            let maxBytes = Self.maxIncomingImageBytes
            let loadFull: @Sendable (String) async -> Data? = { r2Key in
                guard let base else { return nil }
                return await Task.detached {
                    do {
                        let ciphertext = try await client.download(
                            baseURL: base, group: groupId, key: r2Key, maxBytes: maxBytes
                        )
                        return try MessageCrypto.openRaw(ciphertext, using: messageKey)
                    } catch {
                        return nil
                    }
                }.value
            }
            onImages?(sender, safeItems, MessageLimits.clamp(caption), to != nil, loadFull)
        }
    }
}
