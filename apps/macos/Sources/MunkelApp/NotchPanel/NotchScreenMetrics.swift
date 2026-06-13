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

    /// Top-centre panel frame: a generous half-screen canvas pinned to the top
    /// edge (size `screen.frame / 2`, origin at top centre) so the content's
    /// top-anchored layout hangs from the notch and the open/close morph animates
    /// inside a fixed window without resizing it. Notched and notchless screens
    /// share this frame; only the content chrome inside differs.
    @MainActor
    static func panelFrame(for screen: NSScreen) -> NSRect {
        let size = NSSize(width: screen.frame.width / 2, height: screen.frame.height / 2)
        let origin = NSPoint(x: screen.frame.midX - size.width / 2, y: screen.frame.maxY - size.height)
        return NSRect(origin: origin, size: size)
    }
}
