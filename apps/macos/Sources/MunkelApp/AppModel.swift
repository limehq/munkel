import AppKit
import Combine
import CoreGraphics
import Foundation
import IOKit.pwr_mgt
import MunkelKit

enum GitHubLoginState: Equatable {
    case idle
    case requestingCode
    case awaitingUser(userCode: String, verificationURI: URL, expiresAt: Date)
    case fetchingProfile
    case failed(String)
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var groupCodes: [String] = []
    @Published var displayName: String {
        didSet {
            guard displayName != oldValue else { return }
            Identity.displayName = displayName
            // Debounced: the TextField writes per keystroke, and a profile
            // now carries the avatar — broadcasting each edit would fan out
            // kilobytes per key to every member of every group.
            scheduleProfileBroadcast()
        }
    }
    @Published private(set) var githubLoginState: GitHubLoginState = .idle {
        didSet {
            guard githubLoginState != oldValue else { return }
            syncAuthCodeNotch()
        }
    }
    @Published private(set) var githubUserLogin: String? = Identity.githubLogin
    @Published var relayURLString: String {
        didSet {
            UserDefaults.standard.set(relayURLString, forKey: Self.relayURLKey)
        }
    }
    /// The relay every session actually connects to: the `MUNKEL_RELAY_URL` dev
    /// override if set, otherwise the persisted/default `relayURLString`.
    var effectiveRelayURLString: String { Self.relayURLOverride ?? relayURLString }
    /// Bumped whenever any session's presence changes, so views refresh.
    @Published private(set) var presenceVersion = 0

    @Published var localStatus: PresenceStatus = Identity.presenceStatus {
        didSet {
            guard localStatus != oldValue else { return }
            Identity.presenceStatus = localStatus
            if localStatus != .online { isAutoAway = false }
            applyPresence()
        }
    }
    @Published private(set) var isAutoAway = false
    var effectiveStatus: PresenceStatus {
        localStatus == .online && isAutoAway ? .away : localStatus
    }

    func chooseStatus(_ status: PresenceStatus) {
        let clearedAutoAway = isAutoAway
        isAutoAway = false
        if localStatus != status {
            localStatus = status
        } else if clearedAutoAway {
            applyPresence()
        }
    }

    /// Sparkle bridge, injected by `AppDelegate` at launch (release build only;
    /// nil in the dev build, which doesn't auto-update).
    var updater: UpdaterController?
    var closePopover: (() -> Void)?

    private static let groupsKey = "groupCodes"
    private static let relayURLKey = "relayURL"
    private static let defaultRelayURL = "wss://relay.munkel.app"

    /// Development override: when `MUNKEL_RELAY_URL` is set (and non-empty) in
    /// the environment, every session connects there instead of the saved or
    /// default relay. Read once at launch and never written to UserDefaults, so
    /// it can't clobber the persisted `relayURL` — relaunch without it to fall
    /// back. Point a dev build at `wrangler dev` with
    /// `MUNKEL_RELAY_URL=ws://127.0.0.1:8787 bun run dev`, which launches the
    /// binary directly (`open` does not forward the shell environment).
    private static let relayURLOverride: String? = ProcessInfo.processInfo
        .environment["MUNKEL_RELAY_URL"].flatMap { $0.isEmpty ? nil : $0 }

    private var sessions: [String: GroupSession] = [:]
    private let notch = NotchPresenter()
    private var controlServer: ControlServer?
    private var palette: CommandPalettePresenter?
    private var githubLoginTask: Task<Void, Never>?
    private var githubLoginGeneration = 0
    private var profileBroadcastTask: Task<Void, Never>?
    private var idleTimer: Timer?
    private var presenceObservers: Set<AnyCancellable> = []
    private let awayThreshold: TimeInterval = 5 * 60
    private let idlePollInterval: TimeInterval = 30

    init() {
        self.displayName = Identity.displayName
        self.relayURLString = UserDefaults.standard.string(forKey: Self.relayURLKey) ?? Self.defaultRelayURL
        self.groupCodes = UserDefaults.standard.stringArray(forKey: Self.groupsKey) ?? []
        // GitHub login is mandatory: without it no session connects — the
        // persisted groups come back online with the next login.
        if Identity.githubLogin != nil {
            for code in groupCodes {
                openSession(code: code)
            }
        }
        let server = ControlServer(model: self)
        server.start()
        self.controlServer = server
        // Registers the global hotkey (default ⌃⌘M) and owns the palette
        // window — long-lived like the notch, so it survives popover churn.
        self.palette = CommandPalettePresenter(model: self)
        startPresenceMonitoring()
    }

    func session(for code: String) -> GroupSession? {
        sessions[code]
    }

    func join(code rawCode: String) {
        guard githubUserLogin != nil else { return }
        let code = GroupKey.normalize(rawCode)
        guard !code.isEmpty, sessions[code] == nil else { return }
        groupCodes.append(code)
        persistGroups()
        openSession(code: code)
    }

    func leave(code: String) {
        sessions[code]?.stop()
        sessions[code] = nil
        groupCodes.removeAll { $0 == code }
        persistGroups()
    }

    func send(text: String, group code: String, to memberId: String? = nil) {
        guard let session = sessions[code] else { return }
        Task { await session.sendChat(text, to: memberId) }
        if memberId == nil {
            notch.show(
                sender: displayName,
                avatarData: Identity.avatarData,
                text: text,
                isDirect: false,
                group: code,
                groupColor: .groupColor(index: groupCodes.firstIndex(of: code) ?? 0),
                inMultipleGroups: groupCodes.count > 1
            ) { [weak self] reply, images, _ in
                if images.isEmpty {
                    self?.send(text: reply, group: code, to: nil)
                } else {
                    self?.send(images: images, caption: reply, group: code, to: nil)
                }
            }
        }
    }

    /// Send one or more images (an album), optionally with a caption. The
    /// session seals each, uploads to R2 and relays one pointer; see
    /// GroupSession.sendImages.
    func send(images datas: [Data], caption: String = "", group code: String, to memberId: String? = nil) {
        guard let session = sessions[code], !datas.isEmpty else { return }
        Task { await session.sendImages(datas, caption: caption, to: memberId) }
        if memberId == nil {
            Task { [weak self] in
                let built = await Task.detached { () -> (images: [IncomingImage], fulls: [String: Data])? in
                    let datas = Array(datas.prefix(AppPayload.maxImagesPerMessage))
                    let perThumb = AppPayload.perThumbBudget(imageCount: datas.count)
                    var images: [IncomingImage] = []
                    var fulls: [String: Data] = [:]
                    for (index, data) in datas.enumerated() {
                        guard let full = ImageCodec.prepareFull(from: data) else { continue }
                        let thumb = full.data.count <= perThumb
                            ? full.data
                            : ImageCodec.makeThumbnail(from: data, maxBytes: perThumb)
                        guard let thumb else { continue }
                        let id = "echo-\(index)"
                        images.append(IncomingImage(id: id, thumb: thumb, width: full.width, height: full.height, mime: full.mime))
                        fulls[id] = full.data
                    }
                    return images.isEmpty ? nil : (images, fulls)
                }.value
                guard let self, let built else { return }
                self.notch.show(
                    sender: self.displayName,
                    avatarData: Identity.avatarData,
                    text: caption,
                    isDirect: false,
                    group: code,
                    groupColor: .groupColor(index: self.groupCodes.firstIndex(of: code) ?? 0),
                    inMultipleGroups: self.groupCodes.count > 1,
                    images: built.images,
                    loadFull: { id in built.fulls[id] }
                ) { [weak self] reply, images, _ in
                    if images.isEmpty {
                        self?.send(text: reply, group: code, to: nil)
                    } else {
                        self?.send(images: images, caption: reply, group: code, to: nil)
                    }
                }
            }
        }
    }

    #if DEBUG
    /// Dev aid: seed the notch with a synthetic backlog of text + image messages
    /// and show a current message on top, so the expanded-history image hover
    /// preview can be exercised without sending real messages back and forth.
    /// Triggered from the menu's DEBUG section; the rows live the usual 60 s
    /// history window, then expire — re-run the item to refresh them. The heavy
    /// lifting (render + AVIF transcode) is in `DemoHistory`.
    func debugShowDemoHistory() {
        let code = groupCodes.first ?? "demo"
        let index = max(0, groupCodes.firstIndex(of: code) ?? 0)
        // `build` owns the SwiftUI `Color` (computed from the index) and hands it
        // back in the bundle, so this model never has to name a SwiftUI type.
        let demo = DemoHistory.build(group: code, colorIndex: index)

        // Inject the backlog straight into the history buffer, then show the
        // current message above it — the same path a real arrival takes.
        notch.debugSeedHistory(demo.backlog)
        notch.show(
            sender: "Sebil",
            avatarData: Identity.avatarData,
            text: demo.currentText,
            isDirect: false,
            group: code,
            groupColor: demo.color,
            inMultipleGroups: groupCodes.count > 1,
            images: demo.currentImages,
            loadFull: { [fulls = demo.fulls] id in fulls[id] }
        ) { _, _, _ in }
    }
    #endif

    /// Opens the quick-send command palette (also bound to the global hotkey).
    func openCommandPalette() {
        palette?.show()
    }

    // MARK: - GitHub login (device flow)

    /// Mirrors the device-flow user code into the notch while we await the
    /// user. The menu-bar popover that shows the code is `.transient`, so it
    /// vanishes the moment opening the browser steals focus — the notch panel
    /// is focus-independent and keeps the code (already on the clipboard)
    /// visible until the flow leaves `.awaitingUser`.
    private func syncAuthCodeNotch() {
        if case let .awaitingUser(userCode, _, _) = githubLoginState {
            notch.showAuthCode(userCode)
        } else {
            notch.hideAuthCode()
        }
    }

    func startGitHubLogin() {
        githubLoginTask?.cancel()
        githubLoginGeneration += 1
        let generation = githubLoginGeneration
        githubLoginState = .requestingCode
        githubLoginTask = Task { await runGitHubLogin(generation: generation) }
    }

    func cancelGitHubLogin() {
        githubLoginTask?.cancel()
        githubLoginTask = nil
        githubLoginGeneration += 1
        githubLoginState = .idle
    }

    /// Logout makes the app unusable until the next login: all sessions
    /// stop (the group codes stay persisted and reconnect after re-login).
    func logoutGitHub() {
        Identity.avatarData = nil
        Identity.avatarURL = nil
        Identity.githubLogin = nil
        githubUserLogin = nil
        for session in sessions.values {
            session.stop()
        }
        sessions = [:]
        presenceVersion += 1
    }

    /// The whole flow lives in a model-held task: the `.window`-style
    /// MenuBarExtra tears its views down whenever it closes (which opening
    /// the browser forces), so polling must survive without any view alive.
    ///
    /// Every state write is generation-guarded: a cancelled task's in-flight
    /// URLSession call surfaces as `URLError(.cancelled)` (not
    /// `CancellationError`), and without the guard its dying catch arm would
    /// overwrite the state a newer flow — or the cancel itself — just set.
    private func runGitHubLogin(generation: Int) async {
        let auth = GitHubDeviceAuth(clientID: GitHubConfig.clientID)
        do {
            let grant = try await auth.requestDeviceCode()
            guard generation == githubLoginGeneration else { return }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(grant.userCode, forType: .string)
            githubLoginState = .awaitingUser(
                userCode: grant.userCode,
                verificationURI: grant.verificationURI,
                expiresAt: grant.expiresAt
            )
            NSWorkspace.shared.open(grant.verificationURI)

            // Token stays a local — used for one profile fetch, never stored.
            let token = try await auth.pollForAccessToken(grant)
            guard generation == githubLoginGeneration else { return }
            githubLoginState = .fetchingProfile
            let user = try await auth.fetchUser(token: token)

            // Avatar is best-effort: login succeeds without one, the
            // initials fallback covers display.
            var avatar: Data?
            if let url = user.avatarURL,
               let raw = try? await auth.fetchAvatar(
                   from: url, pixelSize: AvatarCodec.maxEncodedPixels
               ) {
                avatar = AvatarCodec.makeAvatar(from: raw)
            }

            guard generation == githubLoginGeneration else { return }
            applyProfile(name: Self.firstName(of: user), avatar: avatar, avatarURL: user.avatarURL?.absoluteString, githubLogin: user.login)
            githubLoginState = .idle
            // Login gates everything: the persisted groups connect only now.
            for code in groupCodes where sessions[code] == nil {
                openSession(code: code)
            }
        } catch is CancellationError {
            // Cancelled flows say nothing — cancelGitHubLogin already reset.
        } catch let error as URLError where error.code == .cancelled {
        } catch let error as GitHubAuthError {
            guard generation == githubLoginGeneration else { return }
            githubLoginState = .failed(Self.message(for: error))
        } catch {
            guard generation == githubLoginGeneration else { return }
            githubLoginState = .failed("No connection to GitHub.")
        }
    }

    /// Writes both identity halves before the single broadcast — a didSet
    /// broadcast would race the avatar write and send a stale profile.
    private func applyProfile(name: String, avatar: Data?, avatarURL: String?, githubLogin login: String?) {
        Identity.avatarData = avatar
        Identity.avatarURL = avatarURL
        Identity.githubLogin = login
        githubUserLogin = login
        displayName = name
        profileBroadcastTask?.cancel()
        broadcastProfile()
    }

    private func scheduleProfileBroadcast() {
        profileBroadcastTask?.cancel()
        profileBroadcastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled else { return }
            self?.broadcastProfile()
        }
    }

    private func broadcastProfile() {
        for session in sessions.values {
            Task { await session.sendProfile() }
        }
    }

    private func broadcastPresence() {
        for session in sessions.values {
            Task { await session.sendPresence() }
        }
    }

    private func applyPresence() {
        let status = effectiveStatus
        for session in sessions.values {
            session.localStatus = status
        }
        broadcastPresence()
    }

    private func startPresenceMonitoring() {
        let timer = Timer(timeInterval: idlePollInterval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.pollIdle() }
        }
        RunLoop.main.add(timer, forMode: .common)
        idleTimer = timer

        let center = NSWorkspace.shared.notificationCenter
        let goneNames: [Notification.Name] = [
            NSWorkspace.screensDidSleepNotification,
            NSWorkspace.willSleepNotification,
            NSWorkspace.sessionDidResignActiveNotification,
        ]
        let backNames: [Notification.Name] = [
            NSWorkspace.screensDidWakeNotification,
            NSWorkspace.didWakeNotification,
            NSWorkspace.sessionDidBecomeActiveNotification,
        ]
        for name in goneNames {
            center.publisher(for: name)
                .sink { [weak self] _ in self?.enterAutoAway() }
                .store(in: &presenceObservers)
        }
        for name in backNames {
            center.publisher(for: name)
                .sink { [weak self] _ in self?.pollIdle() }
                .store(in: &presenceObservers)
        }

        let distributed = DistributedNotificationCenter.default()
        distributed.publisher(for: Notification.Name("com.apple.screenIsLocked"))
            .sink { [weak self] _ in self?.enterAutoAway() }
            .store(in: &presenceObservers)
        distributed.publisher(for: Notification.Name("com.apple.screenIsUnlocked"))
            .sink { [weak self] _ in self?.pollIdle() }
            .store(in: &presenceObservers)
    }

    private func pollIdle() {
        guard localStatus == .online else { return }
        if Self.secondsSinceUserInput() >= awayThreshold, !Self.displayIsKeptAwake() {
            setAutoAway(true)
        } else {
            setAutoAway(false)
        }
    }

    private func enterAutoAway() {
        guard localStatus == .online else { return }
        setAutoAway(true)
    }

    private func setAutoAway(_ value: Bool) {
        guard isAutoAway != value else { return }
        isAutoAway = value
        applyPresence()
    }

    private static func secondsSinceUserInput() -> TimeInterval {
        CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
    }

    private static let remoteControlHolders = [
        "rustdesk",
        "screensharingd",
        "screensharingag",
        "ardagent",
        "teamviewer",
        "anydesk",
        "remoting_host",
        "chrome-remote-desktop",
        "parsec",
        "vncserver",
    ]

    private static func isRemoteControlHolder(_ name: String) -> Bool {
        guard !name.isEmpty else { return false }
        let lower = name.lowercased()
        return remoteControlHolders.contains { lower.hasPrefix($0) || $0.hasPrefix(lower) }
    }

    private static func displayIsKeptAwake() -> Bool {
        displaySleepHolderNames().contains { !isRemoteControlHolder($0) }
    }

    private static func displaySleepHolderNames() -> [String] {
        var raw: Unmanaged<CFDictionary>?
        guard IOPMCopyAssertionsByProcess(&raw) == kIOReturnSuccess,
              let byProcess = raw?.takeRetainedValue() as? [Int: [[String: Any]]]
        else { return [] }

        let canonical = kIOPMAssertionTypePreventUserIdleDisplaySleep as String
        let legacy = kIOPMAssertionTypeNoDisplaySleep as String
        let typeKey = kIOPMAssertionTypeKey as String
        let levelKey = kIOPMAssertionLevelKey as String

        var names: [String] = []
        for assertions in byProcess.values {
            for assertion in assertions {
                let type = assertion[typeKey] as? String ?? ""
                let trueType = assertion["AssertionTrueType"] as? String ?? ""
                let level = assertion[levelKey] as? Int ?? 0
                let holdsDisplay = type == canonical || type == legacy
                    || trueType == canonical || trueType == legacy
                guard holdsDisplay, level != 0 else { continue }
                names.append(assertion["Process Name"] as? String ?? "")
            }
        }
        return names
    }

    /// The display name is always the GitHub first name — not editable.
    /// Accounts without a public name fall back to the login.
    private static func firstName(of user: GitHubUser) -> String {
        guard
            let name = user.name?.trimmingCharacters(in: .whitespaces),
            let first = name.split(separator: " ").first
        else {
            return user.login
        }
        return String(first)
    }

    private static func message(for error: GitHubAuthError) -> String {
        switch error {
        case .deviceFlowDisabled:
            "Device Flow isn't enabled for the OAuth app (see README)."
        case .expired:
            "Code expired — please try again."
        case .accessDenied:
            "Sign-in denied on github.com."
        case .http, .malformedResponse:
            "GitHub responded unexpectedly — please try again."
        }
    }

    // MARK: - munkel CLI (via ControlServer)

    func handleControl(_ request: ControlRequest) async -> ControlResponse {
        switch request.action {
        case "groups":
            let infos = groupCodes.map { code in
                ControlGroupInfo(
                    code: code,
                    connected: sessions[code]?.isConnected ?? false,
                    members: sessions[code]?.members.map(\.label) ?? []
                )
            }
            return ControlResponse(ok: true, groups: infos)

        case "send":
            // An image send carries file paths; the app reads them here so the
            // bytes never crossed the control socket. An album needs no text.
            var imageDatas: [Data] = []
            for path in request.imagePaths ?? [] {
                guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)), !data.isEmpty else {
                    return ControlResponse(ok: false, error: "Couldn't read image file: \(path)")
                }
                imageDatas.append(data)
            }
            let text = request.text ?? ""
            guard !imageDatas.isEmpty || !text.isEmpty else {
                return ControlResponse(ok: false, error: "Empty message")
            }
            let isBroadcast = (request.to.map { ["all", "*"].contains($0.lowercased()) }) ?? false

            // Delivers the resolved payload to one target: an image album (with
            // the text as its shared caption) or a plain chat message.
            func deliver(_ session: GroupSession, to recipientId: String?) async -> Bool {
                if !imageDatas.isEmpty {
                    return await session.sendImages(imageDatas, caption: text, to: recipientId)
                }
                return await session.sendChat(text, to: recipientId)
            }
            // Image sends can fail at the codec, not just the relay — say so.
            let sendFailureError = imageDatas.isEmpty
                ? "Send failed — no connection to the relay?"
                : "Couldn't send the image — encoding failed or no connection to the relay"

            // Channel-scoped send: explicit channel code. Required for a
            // broadcast and used to disambiguate a name across channels.
            if let groupQuery = request.group {
                guard let session = resolveGroup(groupQuery) else {
                    return ControlResponse(ok: false, error: "Unknown or ambiguous channel \"\(groupQuery)\" — munkel channels shows them all")
                }
                var recipientId: String?
                if let to = request.to, !isBroadcast {
                    let matches = session.members.filter { Self.recipientMatches($0, to) }
                    guard matches.count == 1 else {
                        let problem = matches.isEmpty ? "isn't online" : "is ambiguous"
                        return ControlResponse(ok: false, error: "\"\(to)\" \(problem) in \(session.code)")
                    }
                    recipientId = matches[0].id
                }
                let sent = await deliver(session, to: recipientId)
                return sent
                    ? ControlResponse(ok: true)
                    : ControlResponse(ok: false, error: sendFailureError)
            }

            // Recipient-only send (`munkel dm <name> …` / `munkel image <name> …`):
            // no channel given, so resolve the name across every channel. This
            // lets an agent notify someone in a single call.
            guard let to = request.to, !isBroadcast else {
                return ControlResponse(ok: false, error: "Broadcast needs a channel — say `munkel <channel> all …`")
            }
            var hits: [(session: GroupSession, member: GroupSession.Member)] = []
            for code in groupCodes {
                guard let session = sessions[code] else { continue }
                for member in session.members where Self.recipientMatches(member, to) {
                    hits.append((session, member))
                }
            }
            guard hits.count == 1 else {
                if hits.isEmpty {
                    return ControlResponse(ok: false, error: "No online member matches \"\(to)\" — munkel channels shows who's online")
                }
                // Ambiguous: name only the candidate channels (and attach them
                // as a discovery payload) so the caller can retry with
                // `munkel <channel> <name> …` — never the whole social graph.
                var candidateCodes: [String] = []
                for code in hits.map(\.session.code) where !candidateCodes.contains(code) {
                    candidateCodes.append(code)
                }
                let payload = candidateCodes.compactMap { code in
                    sessions[code].map {
                        ControlGroupInfo(code: code, connected: $0.isConnected, members: $0.members.map(\.label))
                    }
                }
                return ControlResponse(
                    ok: false,
                    error: "\"\(to)\" is in \(candidateCodes.joined(separator: ", ")) — say `munkel <channel> \(to) …`",
                    groups: payload
                )
            }
            let sent = await deliver(hits[0].session, to: hits[0].member.id)
            return sent
                ? ControlResponse(ok: true)
                : ControlResponse(ok: false, error: "Send failed — no connection to the relay?")

        default:
            return ControlResponse(ok: false, error: "Unknown action \"\(request.action)\"")
        }
    }

    /// Recipient match shared by the channel-scoped and cross-channel send
    /// paths: case-insensitive display-name match, or a public-key id prefix.
    private static func recipientMatches(_ member: GroupSession.Member, _ query: String) -> Bool {
        member.label.caseInsensitiveCompare(query) == .orderedSame
            || member.id.hasPrefix(query.lowercased())
    }

    /// Exact code match first, then unique prefix (so `munkel kaffee …` works).
    private func resolveGroup(_ query: String) -> GroupSession? {
        let normalized = GroupKey.normalize(query)
        if let exact = sessions[normalized] {
            return exact
        }
        let prefixMatches = groupCodes.filter { $0.hasPrefix(normalized) }
        guard prefixMatches.count == 1 else { return nil }
        return sessions[prefixMatches[0]]
    }

    private func openSession(code: String) {
        guard let relayURL = URL(string: effectiveRelayURLString) else { return }
        let session = GroupSession(code: code, relayURL: relayURL)
        session.onStateChange = { [weak self] in
            self?.presenceVersion += 1
        }
        session.onChat = { [weak self] sender, text, isDirect in
            guard let self else { return }
            self.notch.show(
                sender: sender.label,
                avatarData: sender.avatar,
                text: text,
                isDirect: isDirect,
                group: code,
                groupColor: .groupColor(index: self.groupCodes.firstIndex(of: code) ?? 0),
                inMultipleGroups: self.groupCodes.count > 1,
                silent: self.effectiveStatus.suppressesNotchPreview
            ) { [weak self] reply, images, privately in
                // Default mirrors how the message arrived; the toggle
                // in the reply field can override per message.
                let to = privately ? sender.id : nil
                if images.isEmpty {
                    self?.send(text: reply, group: code, to: to)
                } else {
                    self?.send(images: images, caption: reply, group: code, to: to)
                }
            }
        }
        session.onImages = { [weak self] sender, items, caption, isDirect, loadFull in
            guard let self else { return }
            let images = items.map {
                IncomingImage(id: $0.r2Key, thumb: $0.thumb, width: $0.width, height: $0.height, mime: $0.mime)
            }
            self.notch.show(
                sender: sender.label,
                avatarData: sender.avatar,
                text: caption,
                isDirect: isDirect,
                group: code,
                groupColor: .groupColor(index: self.groupCodes.firstIndex(of: code) ?? 0),
                inMultipleGroups: self.groupCodes.count > 1,
                images: images,
                silent: self.effectiveStatus.suppressesNotchPreview,
                loadFull: loadFull
            ) { [weak self] reply, images, privately in
                let to = privately ? sender.id : nil
                if images.isEmpty {
                    self?.send(text: reply, group: code, to: to)
                } else {
                    self?.send(images: images, caption: reply, group: code, to: to)
                }
            }
        }
        session.localStatus = effectiveStatus
        sessions[code] = session
        session.start()
    }

    private func persistGroups() {
        UserDefaults.standard.set(groupCodes, forKey: Self.groupsKey)
    }
}
