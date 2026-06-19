import AppKit
import SwiftUI

/// The Munkel brand mark — the "shushing" meerkat silhouette — as a template
/// image shared by the menu-bar status item and the popover header. Template
/// rendering means macOS tints it (monochrome, auto-inverting for light/dark
/// menu bars and the accent). The source is a single-path SVG that loads as a
/// vector `_NSSVGImageRep`, so it stays crisp at any size. Loaded once from the
/// module's resource bundle.
enum BrandGlyph {
    /// Shared template `NSImage` for AppKit surfaces (the status-item button).
    static let templateImage: NSImage? = {
        guard
            let url = Bundle.module.url(forResource: "MunkelGlyph", withExtension: "svg"),
            let image = NSImage(contentsOf: url)
        else { return nil }
        image.isTemplate = true
        return image
    }()

    /// SwiftUI view for the popover header. The caller applies
    /// `.renderingMode(.template)` + a `foregroundStyle` to tint it; falls back
    /// to the old SF Symbol if the resource is ever missing.
    static var image: Image {
        if let templateImage {
            return Image(nsImage: templateImage)
        }
        return Image(systemName: "bubble.left.and.bubble.right.fill")
    }
}
