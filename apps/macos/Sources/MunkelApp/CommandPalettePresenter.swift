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

    /// Fixed width; height follows the SwiftUI content (preferredContentSize).
    private static let panelWidth: CGFloat = 380

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

        let panel = CommandPalettePanel(size: NSSize(width: Self.panelWidth, height: 200))
        panel.onResignKey = { [weak self] in self?.hide() }

        let root = CommandPaletteView(
            model: model,
            state: state,
            onClose: { [weak self] in self?.hide() }
        )
        // Hosting controller with preferredContentSize so the panel resizes
        // to the (fixed-width, content-height) SwiftUI layout — compact for
        // a couple of circles, capped by the view's own maxHeight.
        let controller = NSHostingController(rootView: root)
        controller.sizingOptions = [.preferredContentSize]
        panel.contentViewController = controller
        panel.layoutIfNeeded()

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
        let size = panel.frame.size
        let x = frame.midX - size.width / 2
        let y = frame.maxY - size.height - frame.height * 0.18
        panel.setFrameOrigin(NSPoint(x: x, y: y))
    }

    /// Arrow keys are a full D-pad over the target chips while the message
    /// field keeps focus: left/right within a circle, up/down between
    /// circles. All four are consumed (return nil) so they don't move the
    /// text cursor. Return (onSubmit) sends and Esc (onExitCommand) closes.
    private func installKeyMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            var consumed = false
            MainActor.assumeIsolated {
                let dir: CommandPaletteState.Direction?
                switch event.keyCode {
                case 123: dir = .left
                case 124: dir = .right
                case 125: dir = .down
                case 126: dir = .up
                default: dir = nil
                }
                if let dir {
                    self.state.move(dir)
                    consumed = true
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
