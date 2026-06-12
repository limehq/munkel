import AppKit
import Foundation
import FluesterungKit

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
    @Published private(set) var githubLoginState: GitHubLoginState = .idle
    @Published private(set) var githubUserLogin: String? = Identity.githubLogin
    @Published var relayURLString: String {
        didSet {
            UserDefaults.standard.set(relayURLString, forKey: Self.relayURLKey)
        }
    }
    /// Bumped whenever any session's presence changes, so views refresh.
    @Published private(set) var presenceVersion = 0

    private static let groupsKey = "groupCodes"
    private static let relayURLKey = "relayURL"
    private static let defaultRelayURL = "wss://fluesterung.limehq.workers.dev"

    private var sessions: [String: GroupSession] = [:]
    private let notch = NotchPresenter()
    private var controlServer: ControlServer?
    private var githubLoginTask: Task<Void, Never>?
    private var githubLoginGeneration = 0
    private var profileBroadcastTask: Task<Void, Never>?

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
    }

    // MARK: - GitHub login (device flow)

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
            applyProfile(name: Self.firstName(of: user), avatar: avatar, githubLogin: user.login)
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
            githubLoginState = .failed("Keine Verbindung zu GitHub.")
        }
    }

    /// Writes both identity halves before the single broadcast — a didSet
    /// broadcast would race the avatar write and send a stale profile.
    private func applyProfile(name: String, avatar: Data?, githubLogin login: String?) {
        Identity.avatarData = avatar
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
            "Device Flow ist für die OAuth-App nicht aktiviert (siehe README)."
        case .expired:
            "Code abgelaufen — bitte erneut versuchen."
        case .accessDenied:
            "Anmeldung auf github.com abgelehnt."
        case .http, .malformedResponse:
            "GitHub hat unerwartet geantwortet — bitte erneut versuchen."
        }
    }

    // MARK: - flustr CLI (via ControlServer)

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
            guard let text = request.text, !text.isEmpty else {
                return ControlResponse(ok: false, error: "Leere Nachricht")
            }
            guard let groupQuery = request.group else {
                return ControlResponse(ok: false, error: "Kreis fehlt")
            }
            guard let session = resolveGroup(groupQuery) else {
                return ControlResponse(ok: false, error: "Unbekannter oder mehrdeutiger Kreis \"\(groupQuery)\" — flustr groups zeigt alle")
            }

            var recipientId: String?
            if let to = request.to, !["all", "alle", "*"].contains(to.lowercased()) {
                let matches = session.members.filter {
                    $0.label.caseInsensitiveCompare(to) == .orderedSame || $0.id.hasPrefix(to.lowercased())
                }
                guard matches.count == 1 else {
                    let problem = matches.isEmpty ? "ist nicht online" : "ist mehrdeutig"
                    return ControlResponse(ok: false, error: "\"\(to)\" \(problem) in \(session.code)")
                }
                recipientId = matches[0].id
            }

            let sent = await session.sendChat(text, to: recipientId)
            return sent
                ? ControlResponse(ok: true)
                : ControlResponse(ok: false, error: "Senden fehlgeschlagen — keine Verbindung zum Relay?")

        default:
            return ControlResponse(ok: false, error: "Unbekannte Aktion \"\(request.action)\"")
        }
    }

    /// Exact code match first, then unique prefix (so `flustr kaffee …` works).
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
        guard let relayURL = URL(string: relayURLString) else { return }
        let session = GroupSession(code: code, relayURL: relayURL)
        session.onStateChange = { [weak self] in
            self?.presenceVersion += 1
        }
        session.onChat = { [weak self] sender, text, isDirect in
            guard let self else { return }
            Task {
                await self.notch.show(
                    sender: sender.label,
                    avatarData: sender.avatar,
                    text: text,
                    isDirect: isDirect
                ) { [weak self] reply, privately in
                    // Default mirrors how the message arrived; the toggle
                    // in the reply field can override per message.
                    self?.send(text: reply, group: code, to: privately ? sender.id : nil)
                }
            }
        }
        sessions[code] = session
        session.start()
    }

    private func persistGroups() {
        UserDefaults.standard.set(groupCodes, forKey: Self.groupsKey)
    }
}
