import AppKit

/// Borderless, non-activating floating panel that hosts the command
/// palette. Like Spotlight, it takes key focus (so the search field types)
/// without activating the app, leaving the user's previous app frontmost.
/// The `canBecomeKey` override mirrors DynamicNotchPanel — an NSPanel won't
/// become key while borderless/nonactivating otherwise.
final class CommandPalettePanel: NSPanel {
    var onResignKey: (() -> Void)?

    init(size: NSSize) {
        super.init(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = .floating
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        // Draggable like Spotlight: dragging empty background moves the
        // panel, while clicks on the chips/field still register (AppKit only
        // starts a window drag past the drag threshold, not on a click).
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        // Capture-proof like the notch and popover: the palette shows circle
        // codes and message drafts, which must never leak into a screen
        // share. Set on the panel directly so it holds before any content is
        // composited (the SwiftUI `.excludedFromScreenCapture()` is backup).
        sharingType = .none
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    /// Spotlight behaviour: clicking another window/app dismisses the palette.
    override func resignKey() {
        super.resignKey()
        onResignKey?()
    }
}
