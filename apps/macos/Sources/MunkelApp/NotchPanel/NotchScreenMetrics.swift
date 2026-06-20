import AppKit

/// Pure measurement + placement geometry for the notch panel — the single
/// source of truth shared by the panel (where it sits) and the hosted content
/// (how it lays out), so the two can never drift on a multi-display setup.
///
/// Reads hardware-notch geometry from `NSScreen`, trimmed to exactly what Munkel
/// needs. No window state — just `CGRect` math from an `NSScreen`. Subsumes the
/// old `NotchPresenter.hardwareNotchSize()`.
enum NotchScreenMetrics {
    /// Hardware-notch cutout + menu-bar geometry for an explicit screen.
    ///
    /// `notchSize` is the physical cutout — width between the two auxiliary top
    /// areas, height the top safe-area inset — and is `.zero` on screens without
    /// a notch, matching the app's previous `hardwareNotchSize()` so
    /// `MessageNotchContainer`'s `notchSize.height > 0` branch keeps working
    /// unchanged. `menubarHeight` is reported even without a notch (the floating
    /// fallback anchors to it).
    @MainActor
    static func metrics(for screen: NSScreen?) -> (notchSize: CGSize, hasNotch: Bool, menubarHeight: CGFloat) {
        guard let screen else { return (.zero, false, 0) }
        let menubarHeight = screen.frame.maxY - screen.visibleFrame.maxY
        guard
            screen.safeAreaInsets.top > 0,
            let leftWidth = screen.auxiliaryTopLeftArea?.width,
            let rightWidth = screen.auxiliaryTopRightArea?.width
        else {
            return (.zero, false, menubarHeight)
        }
        let cutout = CGSize(
            width: screen.frame.width - leftWidth - rightWidth,
            height: screen.safeAreaInsets.top
        )
        return (cutout, true, menubarHeight)
    }

    /// Top-centre panel frame spanning the *full* screen height, pinned so its top
    /// edge is the screen top. Full height (not the old half-screen) gives the
    /// top-anchored content unlimited room to grow downward — expanded history
    /// could otherwise outgrow a half-screen window and get clipped at the
    /// window's bottom edge, cutting off the notch's bottom corners and breaking
    /// the layout. The visible shape is unaffected: the NotchShape mask sizes to
    /// the content, not the window, and the empty canvas stays click-through.
    /// Notched and notchless screens share this frame; only the content chrome
    /// inside differs.
    ///
    /// Width is normally half the screen — plenty for the notch chrome. Image
    /// messages pass `wide: true` to get the full screen width, so the
    /// free-floating Quick-Look preview (``ImagePreviewOverlay``) can grow to
    /// near-fullscreen; a child view can't paint wider than its host window. The
    /// wider canvas is still click-through and the mask still sizes to the chrome,
    /// so the only visible difference is how large the preview is allowed to get.
    @MainActor
    static func panelFrame(for screen: NSScreen, wide: Bool = false) -> NSRect {
        let width = wide ? screen.frame.width : screen.frame.width / 2
        let origin = NSPoint(x: screen.frame.midX - width / 2, y: screen.frame.minY)
        return NSRect(x: origin.x, y: origin.y, width: width, height: screen.frame.height)
    }
}
