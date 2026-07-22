#if DEBUG
import AppKit
import MunkelKit
import SwiftUI

/// Builds the demo backlog on the main actor: renders a few labelled gradient
/// PNGs, transcodes them through the real `ImageCodec` path (so the cells decode
/// exactly like received images), and assembles history rows + a current message.
/// Driven by `AppModel.debugShowDemoHistory` (defined in AppModel.swift so it can
/// reach the private `notch`).
@MainActor
enum DemoHistory {
    struct Built {
        var backlog: [HistoryEntry]
        var currentText: String
        var currentImages: [IncomingImage]
        /// The channel's color, computed here so callers (AppModel) needn't name a
        /// SwiftUI type — passed straight through to `notch.show`.
        var color: Color
        /// Full-resolution AVIF per r2Key — the per-image loader returns these,
        /// so there's no R2 round trip for demo pictures.
        var fulls: [String: Data]
    }

    static func build(group: String, colorIndex: Int) -> Built {
        let color = Color.groupColor(index: colorIndex)
        var fulls: [String: Data] = [:]

        // Render → transcode one demo picture, registering its full bytes.
        func make(_ id: String, _ label: String, _ width: Int, _ height: Int,
                  _ from: NSColor, _ to: NSColor, budget: Int) -> IncomingImage? {
            let png = render(label, width, height, from, to)
            guard let full = ImageCodec.prepareFull(from: png) else { return nil }
            // Mirror sendImages: reuse the full AVIF as the inline thumb when it
            // fits the per-image budget, else a small AVIF.
            let thumb = full.data.count <= budget
                ? full.data
                : (ImageCodec.makeThumbnail(from: png, maxBytes: budget) ?? full.data)
            fulls[id] = full.data
            return IncomingImage(id: id, thumb: thumb, width: full.width, height: full.height)
        }

        let single = AppPayload.perThumbBudget(imageCount: 1)

        // A matrix of aspect ratios (16:9, 4:3, 1:1, 9:16) at different sizes —
        // including one tiny image — so the centered preview's fit (fill up to the
        // screen, never upscale past native, aspect preserved) is easy to judge
        // across shapes and scales. The label baked into each picture names its
        // ratio + pixel size, so it's legible right in the preview. Each becomes
        // its own single-image history row.
        let singleSpecs: [(caption: String, w: Int, h: Int, from: NSColor, to: NSColor)] = [
            ("16:9 · 1920×1080", 1920, 1080, .systemIndigo, .systemPurple),
            ("16:9 · 640×360", 640, 360, .systemBlue, .systemTeal),
            ("4:3 · 1600×1200", 1600, 1200, .systemGreen, .systemMint),
            ("1:1 · 1280×1280", 1280, 1280, .systemPink, .systemRed),
            ("9:16 · 1080×1920", 1080, 1920, .systemOrange, .systemYellow),
            ("1:1 · 160×160", 160, 160, .systemCyan, .systemBlue),
        ]
        let singles: [(caption: String, image: IncomingImage)] = singleSpecs.enumerated().compactMap { offset, spec in
            guard let image = make("demo-single-\(offset)", spec.caption, spec.w, spec.h, spec.from, spec.to, budget: single)
            else { return nil }
            return (spec.caption, image)
        }

        // A mixed-aspect album so the in-grid hover preview can be checked too.
        let albumSpecs: [(caption: String, w: Int, h: Int, from: NSColor, to: NSColor)] = [
            ("4:3 · 800×600", 800, 600, .systemRed, .systemOrange),
            ("16:9 · 960×540", 960, 540, .systemPurple, .systemBlue),
            ("1:1 · 600×600", 600, 600, .systemTeal, .systemGreen),
        ]
        let albumBudget = AppPayload.perThumbBudget(imageCount: albumSpecs.count)
        let album = albumSpecs.enumerated().compactMap { offset, spec in
            make("demo-album-\(offset)", spec.caption, spec.w, spec.h, spec.from, spec.to, budget: albumBudget)
        }

        // Immutable snapshot for the @Sendable per-row loaders (they must not
        // capture the mutable `fulls`).
        let resolved = fulls
        func entry(_ text: String, images: [IncomingImage] = [], caption: String = "") -> HistoryEntry {
            let label: String
            if images.isEmpty {
                label = text
            } else if !caption.isEmpty {
                label = "📷 \(caption)"
            } else {
                label = images.count == 1 ? "📷 Image" : "📷 \(images.count) images"
            }
            return HistoryEntry(
                sender: "Sebil", text: label, isDirect: false, group: group, groupColor: color,
                receivedAt: Date(), sentAt: Date(), images: images, caption: caption,
                loadFull: { id in resolved[id] }
            )
        }

        // Oldest first — visibleHistory keeps chronological order, so the newest
        // row sits directly above the current message.
        var backlog: [HistoryEntry] = [entry("hey, schau dir die Formate mal an 👇")]
        for item in singles {
            backlog.append(entry("", images: [item.image], caption: item.caption))
        }
        if !album.isEmpty { backlog.append(entry("", images: album, caption: "Album · gemischte Formate")) }

        return Built(
            backlog: backlog,
            currentText: "nein, ich schicke keine Nachricht 🙂",
            currentImages: [],
            color: color,
            fulls: resolved
        )
    }

    /// A labelled diagonal-gradient PNG with a grid + border, so size and
    /// sharpness are easy to judge in the preview.
    static func render(_ label: String, _ width: Int, _ height: Int, _ from: NSColor, _ to: NSColor) -> Data {
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
            samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
        ) else { return Data() }
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        guard let ctx = NSGraphicsContext.current?.cgContext else { return Data() }

        let space = CGColorSpaceCreateDeviceRGB()
        if let gradient = CGGradient(colorsSpace: space, colors: [from.cgColor, to.cgColor] as CFArray, locations: [0, 1]) {
            ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: width, y: height), options: [])
        }
        ctx.setStrokeColor(NSColor(white: 1, alpha: 0.16).cgColor)
        ctx.setLineWidth(2)
        for x in stride(from: 0, through: width, by: 80) {
            ctx.move(to: CGPoint(x: x, y: 0)); ctx.addLine(to: CGPoint(x: x, y: height))
        }
        for y in stride(from: 0, through: height, by: 80) {
            ctx.move(to: CGPoint(x: 0, y: y)); ctx.addLine(to: CGPoint(x: width, y: y))
        }
        ctx.strokePath()
        ctx.setStrokeColor(NSColor.white.withAlphaComponent(0.85).cgColor)
        ctx.setLineWidth(10)
        ctx.stroke(CGRect(x: 5, y: 5, width: width - 10, height: height - 10))

        let style = NSMutableParagraphStyle()
        style.alignment = .center
        let side = CGFloat(min(width, height))
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.boldSystemFont(ofSize: side / 11),
            .foregroundColor: NSColor.white,
            .paragraphStyle: style,
        ]
        NSString(string: label).draw(
            in: CGRect(x: 0, y: CGFloat(height) / 2 - side / 14, width: CGFloat(width), height: side / 6),
            withAttributes: attributes
        )
        return rep.representation(using: .png, properties: [:]) ?? Data()
    }
}
#endif
