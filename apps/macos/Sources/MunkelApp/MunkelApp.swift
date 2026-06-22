import AppKit
import Combine
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
    /// App-wide ⌘-key monitor that forwards the editing actions to the focused
    /// field editor; retained for the process lifetime.
    private var editingMonitor: Any?
    private var updateBadgeCancellable: AnyCancellable?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory: no Dock icon — menu bar item and notch are the only UI.
        NSApp.setActivationPolicy(.accessory)

        // An accessory app gets no main menu, so the standard editing actions
        // (⌘X/⌘C/⌘V/⌘A and the emoji picker) are never routed to the focused
        // text field's responder. A standard, never-displayed menu wires them
        // back up app-wide.
        installMainMenu()
        // The menu alone isn't enough: SwiftUI's Settings scene replaces the
        // main menu after launch, and the non-activating Quick Send / notch
        // panels don't route menu key equivalents anyway. Forward the shortcuts
        // straight to the first responder so every field behaves normally.
        installEditingShortcutMonitor()

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

        #if !DEBUG
        if let button = item.button {
            installUpdateBadge(on: button, updater: updater)
        }
        #endif
    }

    private func installUpdateBadge(on button: NSStatusBarButton, updater: UpdaterController) {
        let badge = NSImageView()
        badge.image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: "Update available")
        badge.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 7, weight: .bold)
        badge.contentTintColor = .controlAccentColor
        badge.translatesAutoresizingMaskIntoConstraints = false
        badge.isHidden = true
        button.addSubview(badge)
        NSLayoutConstraint.activate([
            badge.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -1),
            badge.topAnchor.constraint(equalTo: button.topAnchor, constant: 2),
        ])
        updateBadgeCancellable = updater.$availableUpdateVersion.sink { version in
            badge.isHidden = version == nil
        }
    }

    /// A standard (never-displayed) main menu so the editing actions reach the
    /// first responder — the focused field editor. The App and Edit submenus are
    /// both present: AppKit only routes the Edit-menu key equivalents and the
    /// emoji picker properly when the menu is shaped the conventional way. The
    /// "Emoji & Symbols" item (⌃⌘Space) is what makes the picker open at all.
    private func installMainMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Munkel", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Delete", action: #selector(NSText.delete(_:)), keyEquivalent: "")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenu.addItem(.separator())
        let emoji = editMenu.addItem(
            withTitle: "Emoji & Symbols",
            action: #selector(NSApplication.orderFrontCharacterPalette(_:)),
            keyEquivalent: " "
        )
        emoji.keyEquivalentModifierMask = [.command, .control]
        editItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }

    /// Forwards the standard editing shortcuts to whatever field editor is the
    /// first responder, via the responder chain (`sendAction(_:to:nil)`). This
    /// works regardless of menu ownership and even when a non-activating panel
    /// is key but the app isn't frontmost — the cases where the menu route
    /// silently fails. ⌘V is left to the per-field monitors when the clipboard
    /// holds an image (they attach it); only plain-text paste is forwarded here.
    private func installEditingShortcutMonitor() {
        editingMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            var handled = false
            MainActor.assumeIsolated {
                let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
                // Emoji & Symbols picker: ⌃⌘Space (space is keyCode 49).
                if mods == [.command, .control], event.keyCode == 49 {
                    handled = NSApp.sendAction(
                        #selector(NSApplication.orderFrontCharacterPalette(_:)), to: nil, from: nil)
                    return
                }
                guard mods == .command, let key = event.charactersIgnoringModifiers?.lowercased()
                else { return }
                let selector: Selector?
                switch key {
                case "a": selector = #selector(NSText.selectAll(_:))
                case "c": selector = #selector(NSText.copy(_:))
                case "x": selector = #selector(NSText.cut(_:))
                case "z": selector = Selector(("undo:"))
                case "v": selector = ClipboardImage.read() == nil ? #selector(NSText.paste(_:)) : nil
                default: selector = nil
                }
                if let selector {
                    handled = NSApp.sendAction(selector, to: nil, from: nil)
                }
            }
            return handled ? nil : event
        }
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
