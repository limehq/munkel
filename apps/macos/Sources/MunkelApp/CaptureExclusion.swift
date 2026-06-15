import AppKit
import SwiftUI

/// Hides the hosting window from screen capture by setting `NSWindow.sharingType`.
/// This reliably removes the window from the legacy CoreGraphics path —
/// `CGWindowListCreateImage`, the system screenshot tools (⌘⇧3/4/5) and older
/// recorders — and from ScreenCaptureKit on macOS ≤ 15.3. Incoming messages,
/// circle codes and drafts must never leak into a screen share.
///
/// Known limitation: on macOS 15.4+ Apple changed display compositing so that
/// ScreenCaptureKit *full-display* capture can ignore `sharingType = .none` and
/// include the window anyway (Apple DTS, 2025). The exclusion is therefore
/// best-effort against modern SCK display recorders; there is no public
/// per-window API for a source app to opt out of an arbitrary recorder's stream.
///
/// Why not even one frame leaks (legacy path), and the invariant that protects it:
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
///
/// DEBUG carve-out: macOS has no "visible in screenshots but not in recordings"
/// sharing type — `.none` hides from both, `.readOnly` shows in both. So we can
/// capture the notch for docs and the landing page, DEBUG builds expose a
/// Settings toggle ("Allow in screenshots", ``CaptureScreenshotPreference``)
/// that switches every capture-excluded surface to `.readOnly`. Release builds
/// have no such path and are always `.none`. Turning it on also makes the
/// surfaces visible in live recordings — that is the unavoidable macOS trade-off.
struct CaptureExclusion: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { ExcludingView() }
    func updateNSView(_ nsView: NSView, context: Context) {}

    private final class ExcludingView: NSView {
        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            window?.sharingType = NSWindow.munkelCaptureSharingType
            #if DEBUG
            observePreferenceIfNeeded()
            #endif
        }

        #if DEBUG
        private var isObservingPreference = false

        // DEBUG: re-apply live when the "Allow in screenshots" toggle flips, so a
        // surface that's already on screen updates without a relaunch. Because
        // the content-root view shares the panel's window, this also updates the
        // panel-level `sharingType` the notch and palette set at birth. The
        // selector observer is auto-removed via a zeroing weak ref (macOS 10.11+).
        private func observePreferenceIfNeeded() {
            guard !isObservingPreference else { return }
            isObservingPreference = true
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(captureSharingPreferenceDidChange),
                name: CaptureScreenshotPreference.didChange,
                object: nil
            )
        }

        @objc private func captureSharingPreferenceDidChange() {
            window?.sharingType = NSWindow.munkelCaptureSharingType
        }
        #endif
    }
}

extension View {
    /// The hosting window never appears in screen shares or screenshots
    /// (except via the DEBUG-only "Allow in screenshots" toggle).
    func excludedFromScreenCapture() -> some View {
        background(CaptureExclusion())
    }
}

extension NSWindow {
    /// Single source of truth for every capture-excluded surface's `sharingType`.
    /// Release builds are always `.none`. DEBUG builds honor the "Allow in
    /// screenshots" toggle (``CaptureScreenshotPreference``) so the notch, palette
    /// and menu can be screenshotted for docs — at the cost of also being visible
    /// in live recordings while the toggle is on.
    static var munkelCaptureSharingType: NSWindow.SharingType {
        #if DEBUG
        CaptureScreenshotPreference.isEnabled ? .readOnly : .none
        #else
        .none
        #endif
    }
}

#if DEBUG
/// DEBUG-only preference behind the "Allow in screenshots" Settings toggle.
/// Default off, so even debug builds stay non-capturable until a developer opts
/// in to grab a screenshot. The menu writes ``defaultsKey`` via `@AppStorage`
/// and calls ``notifyChanged()`` so on-screen surfaces re-read
/// ``NSWindow/munkelCaptureSharingType``.
enum CaptureScreenshotPreference {
    static let defaultsKey = "allowInScreenshots"

    /// Fired when the toggle flips, so live surfaces re-apply their sharing type.
    static let didChange = Notification.Name("MunkelAllowInScreenshotsDidChange")

    static var isEnabled: Bool { UserDefaults.standard.bool(forKey: defaultsKey) }

    static func notifyChanged() {
        NotificationCenter.default.post(name: didChange, object: nil)
    }
}
#endif
