import AppKit
import KeyboardShortcuts
import SwiftUI
import UniformTypeIdentifiers

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
    /// Set while the file-open dialog is up: it steals key focus from the
    /// palette, whose resignKey would otherwise dismiss it (and reset state).
    private var suppressResignHide = false

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
        panel.onResignKey = { [weak self] in
            guard let self, !self.suppressResignHide else { return }
            self.hide()
        }

        let root = CommandPaletteView(
            model: model,
            state: state,
            onClose: { [weak self] in self?.hide() },
            onPickFile: { [weak self] in self?.pickImageFile() }
        )
        // Hosting controller with preferredContentSize so the panel resizes
        // to the (fixed-width, content-height) SwiftUI layout — compact for
        // a couple of channels, capped by the view's own maxHeight.
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

    private func pickImageFile() {
        guard let panel else { return }
        suppressResignHide = true
        defer {
            suppressResignHide = false
            // The open dialog took key focus; hand it back so the palette
            // stays live and the caption field keeps typing.
            panel.makeKeyAndOrderFront(nil)
        }
        let open = NSOpenPanel()
        open.allowedContentTypes = [.image]
        open.allowsMultipleSelection = true
        open.canChooseDirectories = false
        open.message = "Choose image(s) to send"
        NSApp.activate(ignoringOtherApps: true)
        guard open.runModal() == .OK else { return }
        for url in open.urls {
            if let data = try? Data(contentsOf: url) {
                state.attach(data)
            }
        }
    }

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
    /// field keeps focus: left/right within a channel, up/down between
    /// channels. Bare arrows are consumed (return nil) so they don't move the
    /// text cursor; arrows held with an editing modifier (⌘/⌥/⌃/⇧) fall through
    /// to the field editor for word/line/select shortcuts. Tab/Shift+Tab cycle
    /// through all recipients. Return (onSubmit) sends and Esc (onExitCommand) closes.
    private func installKeyMonitor() {
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self else { return event }
            var consumed = false
            MainActor.assumeIsolated {
                // ⌘V with an image on the clipboard attaches it. The app has no
                // Edit menu wiring `paste:`, so SwiftUI's onPasteCommand never
                // fires — intercept the key here instead. Plain text paste (no
                // image on the clipboard) falls through to the field editor.
                if event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
                   event.charactersIgnoringModifiers?.lowercased() == "v" {
                    if self.state.attachClipboardImage() {
                        consumed = true
                    }
                    return
                }

                let editingModifiers: NSEvent.ModifierFlags = [.command, .option, .control, .shift]
                let hasEditingModifier = !event.modifierFlags.intersection(editingModifiers).isEmpty

                let dir: CommandPaletteState.Direction?
                switch event.keyCode {
                case 123: dir = .left
                case 124: dir = .right
                case 125: dir = .down
                case 126: dir = .up
                default: dir = nil
                }
                if let dir, !hasEditingModifier {
                    self.state.move(dir)
                    consumed = true
                } else if event.keyCode == 48 {
                    let backward = event.modifierFlags.contains(.shift)
                    self.state.moveTab(backward: backward)
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
