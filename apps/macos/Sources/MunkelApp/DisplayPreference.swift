import AppKit
import Combine

    /// Which display the notch uses.
    /// Persists by stable UUID and falls back to the active screen when absent.
enum DisplayPreference {
    static let key = "preferredDisplayID"

    struct Option: Identifiable, Hashable {
        let id: String
        let name: String
    }

    @MainActor
    static func id(of screen: NSScreen) -> String? {
        guard let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        else { return nil }
        let displayID = CGDirectDisplayID(number.uint32Value)
        guard let uuid = CGDisplayCreateUUIDFromDisplayID(displayID)?.takeRetainedValue() else { return nil }
        return CFUUIDCreateString(nil, uuid) as String
    }

    @MainActor
    static func connected() -> [Option] {
        NSScreen.screens.compactMap { screen in
            id(of: screen).map { Option(id: $0, name: screen.localizedName) }
        }
    }

    @MainActor
    static func resolvedScreen() -> NSScreen? {
        guard let saved = UserDefaults.standard.string(forKey: key), !saved.isEmpty else { return NSScreen.main }
        return NSScreen.screens.first { id(of: $0) == saved } ?? NSScreen.main
    }
}

/// Keeps the connected-display list fresh for the settings picker.
/// Screen-parameter changes can lag a tick, so it refreshes twice.
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
        guard current != displays else { return }
        displays = current
    }
}
