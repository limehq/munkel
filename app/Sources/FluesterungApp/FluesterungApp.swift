import AppKit
import SwiftUI

/// Owns the status item and the popover. MenuBarExtra(.window) can't draw
/// the classic anchor arrow — only NSPopover does, and it also centers
/// itself under the status item for free.
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate {
    private var statusItem: NSStatusItem?
    private let popover = NSPopover()
    private var model: AppModel?
    /// Guards against the transient-popover flicker: clicking the status
    /// button while open first closes the popover (outside click on
    /// mouseDown), then fires the action (mouseUp) — which would reopen it.
    private var lastClose = Date.distantPast

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory: no Dock icon — menu bar item and notch are the only UI.
        NSApp.setActivationPolicy(.accessory)

        let model = AppModel()
        self.model = model

        let hosting = NSHostingController(rootView: MenuView().environmentObject(model))
        hosting.sizingOptions = .preferredContentSize
        popover.contentViewController = hosting
        popover.behavior = .transient
        // The default open/close animation is what made the popover feel
        // sluggish next to the old MenuBarExtra window.
        popover.animates = false
        popover.delegate = self

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(
            systemSymbolName: "bubble.left.and.bubble.right.fill",
            accessibilityDescription: "Flüsterung"
        )
        item.button?.target = self
        item.button?.action = #selector(togglePopover(_:))
        statusItem = item
    }

    func popoverDidClose(_ notification: Notification) {
        lastClose = Date()
    }

    @objc private func togglePopover(_ sender: NSStatusBarButton) {
        if popover.isShown {
            popover.performClose(sender)
        } else if Date().timeIntervalSince(lastClose) > 0.2 {
            popover.show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
            let window = popover.contentViewController?.view.window
            window?.makeKey()
            // Open without anything focused — otherwise the popover
            // hands focus to the first control and the ring sticks.
            DispatchQueue.main.async {
                window?.makeFirstResponder(nil)
            }
        }
    }
}

@main
struct FluesterungApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // The status item + popover live in the AppDelegate; SwiftUI just
        // needs some scene, and Settings stays dormant for an LSUIElement.
        Settings {
            EmptyView()
        }
    }
}
