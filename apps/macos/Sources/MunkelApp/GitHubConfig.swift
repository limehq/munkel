import Foundation

enum GitHubConfig {
    /// OAuth app "Munkel" (org limehq, device flow enabled). Client IDs
    /// are public by design — the device flow needs no secret.
    static let defaultClientID = "Ov23liAGgt648fdFmImz"

    /// Overridable without recompiling:
    /// `defaults write dev.uq.munkel githubClientID <CLIENT_ID>`
    static var clientID: String {
        UserDefaults.standard.string(forKey: "githubClientID") ?? defaultClientID
    }

    static var isConfigured: Bool { !clientID.isEmpty }
}
