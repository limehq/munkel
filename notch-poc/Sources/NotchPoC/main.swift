import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let runner = DemoRunner()

    func applicationDidFinishLaunching(_ notification: Notification) {
        runner.start()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
// Accessory: no Dock icon, no menu bar — the notch panel is the only UI.
app.setActivationPolicy(.accessory)
app.run()
