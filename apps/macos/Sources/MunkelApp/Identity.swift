import Foundation
import MunkelKit

/// Local identity: a stable per-installation member UUID plus the display
/// name (the GitHub first name — login is mandatory, the name not editable).
/// This never leaves the clients except inside encrypted profile payloads.
enum Identity {
    private static let memberIdKey = "memberId"
    private static let displayNameKey = "displayName"
    private static let avatarDataKey = "avatarData"
    private static let avatarURLKey = "avatarURL"
    private static let githubLoginKey = "githubLogin"
    private static let authProviderKey = "authProvider"
    private static let providerUserIDKey = "providerUserID"
    private static let presenceStatusKey = "presenceStatus"

    static var memberId: String {
        let defaults = UserDefaults.standard
        if let existing = defaults.string(forKey: memberIdKey) {
            return existing
        }
        let fresh = UUID().uuidString.lowercased()
        defaults.set(fresh, forKey: memberIdKey)
        return fresh
    }

    static var displayName: String {
        get { UserDefaults.standard.string(forKey: displayNameKey) ?? NSFullUserName() }
        set { UserDefaults.standard.set(newValue, forKey: displayNameKey) }
    }

    /// Downscaled JPEG of the local user's GitHub avatar, kept for local
    /// display only — peers receive `avatarURL`, never these bytes.
    static var avatarData: Data? {
        get { UserDefaults.standard.data(forKey: avatarDataKey) }
        set { UserDefaults.standard.set(newValue, forKey: avatarDataKey) }
    }

    /// The GitHub avatar URL, broadcast to peers in profile payloads in place
    /// of inline bytes; peers fetch it directly from GitHub. nil after logout.
    static var avatarURL: String? {
        get { UserDefaults.standard.string(forKey: avatarURLKey) }
        set { UserDefaults.standard.set(newValue, forKey: avatarURLKey) }
    }

    /// GitHub login while signed in; nil after logout. Purely informational —
    /// no token is ever kept. Kept for back-compat; `providerUserID` is the
    /// provider-agnostic equivalent.
    static var githubLogin: String? {
        get { UserDefaults.standard.string(forKey: githubLoginKey) }
        set { UserDefaults.standard.set(newValue, forKey: githubLoginKey) }
    }

    /// Which provider the user signed in with; nil after sign-out. This is the
    /// "am I signed in?" signal. Migrates installs that predate the field: a
    /// stored `githubLogin` means they signed in with GitHub.
    static var authProvider: AuthProviderKind? {
        get {
            if let raw = UserDefaults.standard.string(forKey: authProviderKey) {
                return AuthProviderKind(rawValue: raw)
            }
            return githubLogin != nil ? .github : nil
        }
        set { UserDefaults.standard.set(newValue?.rawValue, forKey: authProviderKey) }
    }

    /// Stable per-provider id (GitHub login or Apple user id); nil after
    /// sign-out. Falls back to the legacy `githubLogin` for older installs.
    static var providerUserID: String? {
        get { UserDefaults.standard.string(forKey: providerUserIDKey) ?? githubLogin }
        set { UserDefaults.standard.set(newValue, forKey: providerUserIDKey) }
    }

    static var isSignedIn: Bool { authProvider != nil }

    static var presenceStatus: PresenceStatus {
        get {
            UserDefaults.standard.string(forKey: presenceStatusKey)
                .flatMap(PresenceStatus.init(rawValue:)) ?? .online
        }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: presenceStatusKey) }
    }
}
