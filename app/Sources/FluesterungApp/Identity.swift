import Foundation

/// Local identity: a stable per-installation member UUID plus the
/// user-chosen display name. No accounts — this never leaves the clients
/// except inside encrypted profile payloads.
enum Identity {
    private static let memberIdKey = "memberId"
    private static let displayNameKey = "displayName"
    private static let avatarDataKey = "avatarData"
    private static let githubLoginKey = "githubLogin"
    private static let previousDisplayNameKey = "previousDisplayName"

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

    /// Downscaled JPEG from GitHub, ≤ AvatarCodec.maxEncodedBytes — travels
    /// only inside encrypted profile payloads.
    static var avatarData: Data? {
        get { UserDefaults.standard.data(forKey: avatarDataKey) }
        set { UserDefaults.standard.set(newValue, forKey: avatarDataKey) }
    }

    /// GitHub login while signed in; nil after logout. Purely informational —
    /// no token is ever kept.
    static var githubLogin: String? {
        get { UserDefaults.standard.string(forKey: githubLoginKey) }
        set { UserDefaults.standard.set(newValue, forKey: githubLoginKey) }
    }

    /// The hand-picked name from before a GitHub login, restored on logout.
    static var previousDisplayName: String? {
        get { UserDefaults.standard.string(forKey: previousDisplayNameKey) }
        set { UserDefaults.standard.set(newValue, forKey: previousDisplayNameKey) }
    }
}
