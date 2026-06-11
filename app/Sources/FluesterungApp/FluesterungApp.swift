import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Accessory: no Dock icon — menu bar item and notch are the only UI.
        NSApp.setActivationPolicy(.accessory)
    }
}

@main
struct FluesterungApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var model = AppModel()

    var body: some Scene {
        MenuBarExtra("Flüsterung", systemImage: "bubble.left.and.bubble.right.fill") {
            MenuView()
                .environmentObject(model)
        }
        .menuBarExtraStyle(.window)
    }
}
