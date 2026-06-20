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
    /// Sparkle auto-updater, retained for the process lifetime. Release-only —
    /// nil in the dev build, which must not update the installed release.
    private var updater: UpdaterController?
    /// Guards against the transient-popover flicker: clicking the status
    /// button while open first closes the popover (outside click on
    /// mouseDown), then fires the action (mouseUp) — which would reopen it.
    private var lastClose = Date.distantPast

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory: no Dock icon — menu bar item and notch are the only UI.
        NSApp.setActivationPolicy(.accessory)

        // An accessory app gets no main menu, so the standard editing shortcuts
        // (⌘X/⌘C/⌘V/⌘A) are never routed to the focused text field's responder.
        // A minimal, never-displayed Edit menu wires them back up app-wide.
        installEditMenu()

        let model = AppModel()
        self.model = model

        // Sparkle auto-updates. Release-only: the dev build runs as "Munkel Dev"
        // with its own bundle id and must not update the installed release.
        #if !DEBUG
        let updater = UpdaterController()
        self.updater = updater
        model.updater = updater
        #endif

        // Keep the app resident so the CLI's first send avoids cold-start.
        #if !DEBUG
        LoginItem.registerOnFirstLaunchIfNeeded()
        #endif

        let hosting = NSHostingController(rootView: MenuView().environmentObject(model))
        hosting.sizingOptions = .preferredContentSize
        popover.contentViewController = hosting
        popover.behavior = .transient
        // The default open/close animation is what made the popover feel
        // sluggish next to the old MenuBarExtra window.
        popover.animates = false
        popover.delegate = self

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        // Brand silhouette as a template image, sized for the menu bar;
        // falls back to the SF Symbol if the glyph resource is missing.
        if let glyph = BrandGlyph.templateImage?.copy() as? NSImage {
            glyph.isTemplate = true
            glyph.size = NSSize(width: 18, height: 18)
            glyph.accessibilityDescription = "Munkel"
            item.button?.image = glyph
        } else {
            item.button?.image = NSImage(
                systemSymbolName: "bubble.left.and.bubble.right.fill",
                accessibilityDescription: "Munkel"
            )
        }
        item.button?.target = self
        item.button?.action = #selector(togglePopover(_:))
        statusItem = item
    }

    /// A minimal Edit menu so Cut/Copy/Paste/Select All reach the first
    /// responder (the focused text field).
    private func installEditMenu() {
        let mainMenu = NSMenu()
        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        NSApp.mainMenu = mainMenu
    }

    func popoverDidClose(_ notification: Notification) {
        lastClose = Date()
    }

    @objc private func togglePopover(_ sender: NSStatusBarButton) {
        if popover.isShown {
            popover.performClose(sender)
        } else if Date().timeIntervalSince(lastClose) > 0.2 {
            // A status-item click does not activate an accessory (LSUIElement)
            // app, and a transient popover shown by an inactive app dismisses
            // itself on the very next event — so it flickers open and shut.
            // Activating first makes the popover's window key for real and
            // keeps it open until the user clicks away.
            NSApp.activate(ignoringOtherApps: true)
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
struct MunkelApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // The status item + popover live in the AppDelegate; SwiftUI just
        // needs some scene, and Settings stays dormant for an LSUIElement.
        Settings {
            EmptyView()
        }
    }
}
