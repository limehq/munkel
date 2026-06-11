import Foundation

/// Local identity: a stable per-installation member UUID plus the
/// user-chosen display name. No accounts — this never leaves the clients
/// except inside encrypted profile payloads.
enum Identity {
    private static let memberIdKey = "memberId"
    private static let displayNameKey = "displayName"

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
}
