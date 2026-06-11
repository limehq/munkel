import AppKit
import Foundation
import FluesterungKit

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var groupCodes: [String] = []
    @Published var displayName: String {
        didSet {
            Identity.displayName = displayName
            for session in sessions.values {
                Task { await session.sendProfile() }
            }
        }
    }
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

    init() {
        self.displayName = Identity.displayName
        self.relayURLString = UserDefaults.standard.string(forKey: Self.relayURLKey) ?? Self.defaultRelayURL
        self.groupCodes = UserDefaults.standard.stringArray(forKey: Self.groupsKey) ?? []
        for code in groupCodes {
            openSession(code: code)
        }
        let server = ControlServer(model: self)
        server.start()
        self.controlServer = server
    }

    func session(for code: String) -> GroupSession? {
        sessions[code]
    }

    func join(code rawCode: String) {
        let code = GroupKey.normalize(rawCode)
        guard !code.isEmpty, sessions[code] == nil else { return }
        groupCodes.append(code)
        persistGroups()
        openSession(code: code)
    }

    @discardableResult
    func createGroup() -> String {
        let code = GroupCode.generate()
        join(code: code)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(code, forType: .string)
        return code
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
                return ControlResponse(ok: false, error: "Gruppe fehlt")
            }
            guard let session = resolveGroup(groupQuery) else {
                return ControlResponse(ok: false, error: "Unbekannte oder mehrdeutige Gruppe \"\(groupQuery)\" — flustr groups zeigt alle")
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
        session.onChat = { [weak self] sender, text in
            guard let self else { return }
            Task { await self.notch.show(sender: sender.label, text: text) }
        }
        sessions[code] = session
        session.start()
    }

    private func persistGroups() {
        UserDefaults.standard.set(groupCodes, forKey: Self.groupsKey)
    }
}
