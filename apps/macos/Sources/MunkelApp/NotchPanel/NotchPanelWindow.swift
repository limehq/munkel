import AppKit

/// Borderless, non-activating panel for notch content.
///
/// `sharingType` is set in `init` and re-applied via `applyCaptureExclusion()` so
/// no path can show a capturable panel. `canBecomeKey` stays `true` so the inline
/// reply field can take focus without activating the app.
final class NotchPanelWindow: NSPanel {
    convenience init() {
        self.init(
            contentRect: .zero,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: true
        )
    }

    override init(
        contentRect: NSRect,
        styleMask style: NSWindow.StyleMask,
        backing backingStoreType: NSWindow.BackingStoreType,
        defer flag: Bool
    ) {
        super.init(contentRect: contentRect, styleMask: style, backing: backingStoreType, defer: flag)
        hasShadow = false
        isOpaque = false
        backgroundColor = .clear
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .stationary]
        applyCaptureExclusion()
    }

    /// Keeps the panel out of screen capture; resolves to `.none` in release.
    func applyCaptureExclusion() {
        sharingType = NSWindow.munkelCaptureSharingType
    }

    override var canBecomeKey: Bool { true }
}
