import AppKit
import SwiftUI

enum BrandGlyph {
    static let templateImage: NSImage? = {
        guard
            let url = Bundle.module.url(forResource: "MunkelGlyph", withExtension: "svg"),
            let image = NSImage(contentsOf: url)
        else { return nil }
        image.isTemplate = true
        return image
    }()

    static var image: Image {
        if let templateImage {
            return Image(nsImage: templateImage)
        }
        return Image(systemName: "bubble.left.and.bubble.right.fill")
    }
}
