import Foundation
import ServiceManagement

/// Registers the app to relaunch at login via `SMAppService.mainApp`, so the
/// `munkel` CLI's first send hits an already-running app instead of paying
/// cold-start inside a coding agent's loop. A flat enum of static members that
/// owns its own defaults key, mirroring the codebase's small preference types.
///
/// Never fatal: `register()`/`unregister()` are synchronous and throwing, and
/// every call site stays best-effort — a thrown failure (an unsigned or
/// translocated build, or Login Items disabled system-wide) must not crash
/// launch or the menu.
enum LoginItem {
    /// One-time auto-register guard. Set once (release builds, first launch) and
    /// never re-read for enabling, so a user who later turns the toggle off — or
    /// disables Login Items in System Settings — is not silently re-enabled.
    private static let didAutoRegisterKey = "loginItemAutoRegistered"

    /// True only when the OS will actually launch us at login. `.requiresApproval`
    /// (the user disabled Login Items for this app) and `.notRegistered` both
    /// read as false, so the toggle reflects reality — not merely that we called
    /// `register()`.
    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    /// Register or unregister the app as a login item. Throwing so the menu
    /// binding's `try?` can snap the toggle back to its true state on failure.
    static func setEnabled(_ enabled: Bool) throws {
        if enabled {
            // Re-registering while already enabled hits the documented
            // "already registered" edge — skip it.
            guard SMAppService.mainApp.status != .enabled else { return }
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }

    /// Call once from `AppDelegate.applicationDidFinishLaunching`, RELEASE ONLY:
    /// the dev build is "Munkel Dev" with its own bundle id, and `mainApp` keys
    /// off the running bundle. The flag is set before the attempt, so a failed
    /// or denied first launch is not retried on every subsequent launch.
    static func registerOnFirstLaunchIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: didAutoRegisterKey) else { return }
        defaults.set(true, forKey: didAutoRegisterKey)
        do {
            try setEnabled(true)
        } catch {
            NSLog("munkel: login-item auto-register failed: \(error)")
        }
    }
}
