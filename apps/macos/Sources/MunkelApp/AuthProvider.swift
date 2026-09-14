import Foundation

/// The sign-in providers Munkel supports. GitHub and Apple are the first two;
/// adding another means a new case here plus a flow that produces an
/// `AuthProfile` — the UI, identity store, and orchestration are provider-aware
/// already and don't need reworking.
enum AuthProviderKind: String, Codable, CaseIterable {
    case github
    case apple

    /// User-facing provider name, e.g. "Sign in with \(displayName)".
    var displayName: String {
        switch self {
        case .github: "GitHub"
        case .apple: "Apple"
        }
    }
}

/// What every provider hands back after a successful sign-in. Munkel keeps no
/// token — this is the whole result: a stable id, a name to show, and an
/// optional avatar (GitHub has one, Apple doesn't).
struct AuthProfile {
    let provider: AuthProviderKind
    /// Stable per-provider identifier: the GitHub login or Apple's user id.
    let providerUserID: String
    let displayName: String
    /// Broadcast to peers so they can fetch it; nil when the provider has none.
    let avatarURL: URL?
    /// Downscaled avatar bytes for local display only; nil when there's none.
    let avatarData: Data?
}
