import AppKit

/// Reads an image off the general pasteboard for ⌘V-to-attach. Prefers raw
/// PNG/TIFF data, falling back to any NSImage on the pasteboard. Shared by the
/// command palette and the menu-bar composer — both intercept ⌘V with an
/// NSEvent monitor because an accessory app's text fields don't route `paste:`
/// to SwiftUI's onPasteCommand.
enum ClipboardImage {
    static func read() -> Data? {
        let pasteboard = NSPasteboard.general
        if let data = pasteboard.data(forType: .png) ?? pasteboard.data(forType: .tiff) {
            return data
        }
        if let image = NSImage(pasteboard: pasteboard), let tiff = image.tiffRepresentation {
            return tiff
        }
        return nil
    }
}
