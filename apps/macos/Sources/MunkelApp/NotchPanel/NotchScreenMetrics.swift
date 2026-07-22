import AppKit

/// Shared geometry for notch-panel placement and layout.
enum NotchScreenMetrics {
    /// Returns notch cutout size, notch presence, and menu bar height.
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

    /// Top-centered frame spanning the full screen height — half-width by default,
    /// or full screen width when `wide` (for the near-fullscreen image preview).
    @MainActor
    static func panelFrame(for screen: NSScreen, wide: Bool = false) -> NSRect {
        let width = wide ? screen.frame.width : screen.frame.width / 2
        let origin = NSPoint(x: screen.frame.midX - width / 2, y: screen.frame.minY)
        return NSRect(x: origin.x, y: origin.y, width: width, height: screen.frame.height)
    }
}
