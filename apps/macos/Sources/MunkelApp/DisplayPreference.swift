import AppKit
import Combine

/// Which physical display the notch — and its unread-indicator and auth-code
/// panels — appears on. The choice persists by the display's stable UUID, which
/// survives reconnects and resolution changes (unlike the volatile
/// `CGDirectDisplayID`), and resolution always falls back to the active screen
/// when the chosen display is absent, so unplugging a monitor never hides the
/// notch. Empty/unset means "automatic": follow the active screen.
enum DisplayPreference {
    /// UserDefaults key holding the chosen display's UUID string.
    static let key = "preferredDisplayID"

    /// One connected display, for the settings picker.
    struct Option: Identifiable, Hashable {
        let id: String   // stable UUID string
        let name: String
    }

    /// Stable UUID string for a screen, or nil if it can't be derived.
    @MainActor
    static func id(of screen: NSScreen) -> String? {
        guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        else { return nil }
        let displayID = CGDirectDisplayID(number.uint32Value)
        guard let uuid = CGDisplayCreateUUIDFromDisplayID(displayID)?.takeRetainedValue() else { return nil }
        return CFUUIDCreateString(nil, uuid) as String
    }

    /// Connected displays in system order, for the settings picker.
    @MainActor
    static func connected() -> [Option] {
        NSScreen.screens.compactMap { screen in
            id(of: screen).map { Option(id: $0, name: screen.localizedName) }
        }
    }

    /// The screen the notch should use: the saved display if it is still
    /// connected, otherwise the active screen.
    @MainActor
    static func resolvedScreen() -> NSScreen? {
        let saved = UserDefaults.standard.string(forKey: key) ?? ""
        guard !saved.isEmpty else { return NSScreen.main }
        return NSScreen.screens.first { id(of: $0) == saved } ?? NSScreen.main
    }
}

/// Always-current, observable list of connected displays for the settings
/// picker. A plain `DisplayPreference.connected()` read in a SwiftUI body is
/// inert — nothing tells the view to re-run it when a monitor is plugged in. So
/// this publishes the list and refreshes on `didChangeScreenParametersNotification`
/// (connect / disconnect / resolution / arrangement), which re-renders the picker
/// live, even while the menu is open. The notification can land a runloop tick
/// before `NSScreen.screens` settles, so it re-reads once more next tick; the
/// equality guard makes that extra read a no-op when nothing actually changed.
@MainActor
final class DisplayList: ObservableObject {
    @Published private(set) var displays: [DisplayPreference.Option] = []
    private var observation: AnyCancellable?

    init() {
        refresh()
        observation = NotificationCenter.default
            .publisher(for: NSApplication.didChangeScreenParametersNotification)
            .sink { [weak self] _ in
                self?.refresh()
                DispatchQueue.main.async { self?.refresh() }
            }
    }

    func refresh() {
        let current = DisplayPreference.connected()
        if current != displays { displays = current }
    }
}
