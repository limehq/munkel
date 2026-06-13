import AppKit

/// The borderless, non-activating panel that hosts the notch content — replaces
/// DynamicNotchKit's `DynamicNotchPanel`.
///
/// It carries the one fix that motivated the rewrite: `sharingType = .none` is
/// set in `init`, before the panel is ever ordered front, and re-asserted by
/// `applyCaptureExclusion()` on every re-host path — so no code path can put a
/// capturable panel on screen. (The library left `sharingType` at its capturable
/// default and silently rebuilt the panel on every screen-parameter change, which
/// is what forced the app's delayed re-assert workaround.) This is the panel-level
/// layer beneath the content-level ``CaptureExclusion``; see that file for the
/// frame-exact invariant the two layers uphold together.
///
/// `canBecomeKey` is overridden so the inline reply field can take keyboard focus
/// without activating the app (the panel is `.nonactivatingPanel`).
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

    /// Single chokepoint keeping the panel out of every screen capture
    /// (ScreenCaptureKit and the legacy CGWindowList APIs). Called from `init`
    /// and from any path that re-hosts or reconfigures the panel, so a visible
    /// capturable panel is unreachable.
    func applyCaptureExclusion() {
        sharingType = .none
    }

    override var canBecomeKey: Bool { true }
}
