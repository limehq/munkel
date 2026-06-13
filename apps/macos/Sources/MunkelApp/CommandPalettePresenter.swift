import AppKit
import KeyboardShortcuts
import SwiftUI

/// Owns the command-palette window and its global hotkey. Long-lived,
/// created by AppModel (mirrors NotchPresenter's ownership). The panel is
/// built fresh on each open and torn down on close, so nothing retains the
/// SwiftUI view — which breaks the AppModel ↔︎ view reference cycle every
/// time the palette closes (the leak DynamicNotchKit has, that we don't
/// repeat).
@MainActor
final class CommandPalettePresenter {
    private unowned let model: AppModel
    private let state: CommandPaletteState
    private var panel: CommandPalettePanel?
    private var keyMonitor: Any?

    private static let panelSize = NSSize(width: 640, height: 440)

    init(model: AppModel) {
        self.model = model
        self.state = CommandPaletteState(app: model)
        KeyboardShortcuts.onKeyDown(for: .togglePalette) { [weak self] in
            self?.toggle()
        }
    }

    func toggle() {
        if panel != nil { hide() } else { show() }
    }

    func show() {
        guard panel == nil else { return }
        state.reset()

        let panel = CommandPalettePanel(size: Self.panelSize)
        panel.onResignKey = { [weak self] in self?.hide() }

        let root = CommandPaletteView(
            model: model,
            state: state,
            onClose: { [weak self] in self?.hide() }
        )
        panel.contentView = NSHostingView(rootView: root)

        position(panel)
        self.panel = panel
        panel.makeKeyAndOrderFront(nil)
        installKeyMonitor()
    }

    func hide() {
        guard let panel else { return }
        // Nil first so the re-entrant resignKey that orderOut triggers no-ops.
        self.panel = nil
        removeKeyMonitor()
        panel.orderOut(nil)
        state.reset()
    }

    /// Centered horizontally on the screen under the pointer, upper third —
    /// the Spotlight position.
    private func position(_ panel: CommandPalettePanel) {
        let mouse = NSEvent.mouseLocation
        let screen = NSScreen.screens.first { $0.frame.contains(mouse) } ?? NSScreen.main
        guard let frame = screen?.visibleFrame else { return }
        let size = Self.panelSize
        let x = frame.midX - size.width / 2
        let y = frame.maxY - size.height - frame.height * 0.18
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }

    /// Up/down arrows move the picker selection. Installed only while the
    /// panel is open; Return (onSubmit) and Esc (onExitCommand) stay with the
    /// search field. Arrows are consumed (return nil) so they don't move the
    /// text cursor. Active only in phase 1 — phase 2 has no list.
    private func installKeyMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            var consumed = false
            MainActor.assumeIsolated {
                guard self.state.target == nil else { return }
                switch event.keyCode {
                case 125: // down arrow
                    let count = self.state.filteredRecipients.count
                    if count > 0 {
                        self.state.selectedIndex = min(count - 1, self.state.selectedIndex + 1)
                    }
                    consumed = true
                case 126: // up arrow
                    self.state.selectedIndex = max(0, self.state.selectedIndex - 1)
                    consumed = true
                default:
                    break
                }
            }
            return consumed ? nil : event
        }
    }

    private func removeKeyMonitor() {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
        }
        keyMonitor = nil
    }
}
