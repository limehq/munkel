import AppKit

/// The borderless, non-activating panel that hosts the notch content.
///
/// It carries the invariant the whole feature rests on: `sharingType` is set in
/// `init`, before the panel is ever ordered front, and re-asserted by
/// `applyCaptureExclusion()` on every re-host path — so no code path can put a
/// capturable panel on screen, not even the empty black shape. The value comes
/// from ``NSWindow/munkelCaptureSharingType`` (always `.none` in release; a
/// DEBUG-only toggle can relax it to `.readOnly` for screenshots). This is the
/// panel-level layer beneath the content-level ``CaptureExclusion``; see that file
/// for the frame-exact invariant the two layers uphold together.
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

    /// Single chokepoint keeping the panel out of screen capture (the legacy
    /// CGWindowList path and screenshots; best-effort against ScreenCaptureKit
    /// display capture on macOS 15.4+, see ``CaptureExclusion``). Called from
    /// `init` and from any path that re-hosts or reconfigures the panel, so a
    /// visible capturable panel is unreachable. Resolves to `.none` in release.
    func applyCaptureExclusion() {
        sharingType = NSWindow.munkelCaptureSharingType
    }

    override var canBecomeKey: Bool { true }
}
