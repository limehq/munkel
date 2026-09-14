#if !MAS
import Combine
import Sparkle
import SwiftUI

/// Bridges Sparkle's `SPUStandardUpdaterController` into SwiftUI: it triggers
/// update checks, mirrors whether a check is currently allowed, exposes the
/// automatic-check setting as a two-way toggle, and surfaces a found update in
/// our own menu (Sparkle "gentle reminders") instead of an unprompted popup.
///
/// `AppDelegate` owns it for the process lifetime and hands it to `MenuView`
/// through `AppModel`. Release-only — the dev build never creates it.
///
/// `@objc` delegate callbacks are `nonisolated` (Sparkle invokes them on the
/// main thread, but the protocols aren't actor-annotated) and hop back to the
/// main actor to touch `@Published` state — the same shape `RelayClient` uses
/// to cross the @objc/Swift-concurrency boundary.
@MainActor
final class UpdaterController: NSObject, ObservableObject {
    /// Mirrors `SPUUpdater.canCheckForUpdates` (KVO) — greys out the menu's
    /// check item while a check or install is already in flight.
    @Published private(set) var canCheckForUpdates = false

    /// Two-way mirror of `SPUUpdater.automaticallyChecksForUpdates`, bound to the
    /// menu toggle. Sparkle persists the chosen value in UserDefaults.
    @Published var automaticallyChecksForUpdates = true {
        didSet { controller.updater.automaticallyChecksForUpdates = automaticallyChecksForUpdates }
    }

    /// Non-nil once a check finds a newer version — drives the prominent
    /// "Update to <version>…" menu item; cleared when a check finds nothing.
    @Published private(set) var availableUpdateVersion: String?

    private var controller: SPUStandardUpdaterController!

    override init() {
        super.init()
        // startingUpdater: true → begins scheduled checks immediately using the
        // SUFeedURL / SUPublicEDKey from Info.plist. We act as both delegates:
        // the user-driver delegate lets a scheduled update surface in our menu
        // instead of Sparkle forcing its own window to the front.
        controller = SPUStandardUpdaterController(
            startingUpdater: true, updaterDelegate: self, userDriverDelegate: self
        )
        let updater = controller.updater
        automaticallyChecksForUpdates = updater.automaticallyChecksForUpdates
        updater.publisher(for: \.canCheckForUpdates).assign(to: &$canCheckForUpdates)
        if updater.automaticallyChecksForUpdates {
            updater.checkForUpdatesInBackground()
        }
    }

    /// User-initiated check (menu). Sparkle shows its standard update UI.
    func checkForUpdates() {
        controller.updater.checkForUpdates()
    }
}

extension UpdaterController: SPUUpdaterDelegate {
    @objc nonisolated func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        let version = item.displayVersionString
        Task { @MainActor in self.availableUpdateVersion = version }
    }

    @objc nonisolated func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
        Task { @MainActor in self.availableUpdateVersion = nil }
    }
}

extension UpdaterController: SPUStandardUserDriverDelegate {
    /// Opt into gentle reminders: we surface scheduled updates in the menu.
    @objc nonisolated var supportsGentleScheduledUpdateReminders: Bool { true }

    /// Don't let Sparkle force its window forward for a *scheduled* update — the
    /// menu indicator is the reminder; the user pulls the update up deliberately.
    @objc nonisolated func standardUserDriverShouldHandleShowingScheduledUpdate(
        _ update: SUAppcastItem, andInImmediateFocus immediateFocus: Bool
    ) -> Bool {
        false
    }

    @objc nonisolated func standardUserDriverWillHandleShowingUpdate(
        _ handleShowingUpdate: Bool, forUpdate update: SUAppcastItem, state: SPUUserUpdateState
    ) {
        let version = update.displayVersionString
        Task { @MainActor in self.availableUpdateVersion = version }
    }
}
#endif
