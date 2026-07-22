import AppKit

/// Reads an image off the general pasteboard for ⌘V-to-attach. Prefers raw GIF
/// data (so an animated GIF keeps its frames), then PNG/TIFF, falling back to
/// any NSImage on the pasteboard. Shared by the command palette and the menu-bar
/// composer — both intercept ⌘V with an NSEvent monitor because an accessory
/// app's text fields don't route `paste:` to SwiftUI's onPasteCommand.
enum ClipboardImage {
    private static let gifType = NSPasteboard.PasteboardType("com.compuserve.gif")

    static func read() -> Data? {
        let pasteboard = NSPasteboard.general
        // GIF first: a copied animated GIF often also exposes a flattened PNG/
        // TIFF still, and reading those would drop the animation.
        if let gif = pasteboard.data(forType: gifType) {
            return gif
        }
        if let data = pasteboard.data(forType: .png) ?? pasteboard.data(forType: .tiff) {
            return data
        }
        if let image = NSImage(pasteboard: pasteboard), let tiff = image.tiffRepresentation {
            return tiff
        }
        return nil
    }
}
