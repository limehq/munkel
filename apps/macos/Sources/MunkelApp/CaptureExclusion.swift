import AppKit
import SwiftUI

/// Hides the hosting window from screen capture — ScreenCaptureKit and the
/// legacy CGWindowList APIs, which is what Teams, Zoom, OBS and the system
/// screenshot tools use — while it stays visible on the physical display.
/// Incoming messages must never leak into a screen share.
///
/// Why not even one frame leaks, and the invariant that protects it:
/// `sharingType` is set synchronously in `viewDidMoveToWindow`, i.e. within
/// the same CATransaction that mounts this view. As long as this view sits
/// at the ROOT of the notch content — never inside a lazily-mounted branch
/// (`if`, `.onAppear`, a delayed overlay) — message content is instantiated
/// in the same SwiftUI update pass, so no transaction containing content is
/// ever flushed to the WindowServer with sharing still enabled. The panel
/// itself is also born non-capturable — `NotchPanelWindow` sets `sharingType`
/// in `init`, before it is ever ordered front — so even the empty black notch
/// shape (alpha 0, content unmounted) never leaks. NotchPresenter re-asserts
/// the flag once after `expand()` as cheap insurance only.
///
/// Corollary: notch content must not use `.help()` — AppKit draws tooltips
/// in their own window, which cannot inherit this exclusion and would float
/// visibly through a share while the notch itself stays hidden.
struct CaptureExclusion: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { ExcludingView() }
    func updateNSView(_ nsView: NSView, context: Context) {}

    private final class ExcludingView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            window?.sharingType = .none
        }
    }
}

extension View {
    /// The hosting window never appears in screen shares or screenshots.
    func excludedFromScreenCapture() -> some View {
        background(CaptureExclusion())
    }
}
