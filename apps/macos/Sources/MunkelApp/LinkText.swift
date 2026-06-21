import AppKit
import SwiftUI

/// Message body text with any URLs turned into clickable links. Backed by an
/// NSTextView so links can be both drawn (tinted + underlined) and hit-tested:
/// the reply field opens from a click anywhere on the message, so the click
/// monitor (NotchPresenter) needs to know when a click actually landed on a URL
/// and should open the browser instead. Opening happens there, not here, so the
/// two never both fire on one click.
struct LinkText: NSViewRepresentable {
    let text: String
    let font: NSFont
    let textColor: NSColor
    let lineLimit: Int
    /// Registers the backing view with the model the moment it appears.
    let register: (LinkTextView) -> Void

    func makeNSView(context: Context) -> LinkTextView {
        let view = LinkTextView()
        view.apply(text: text, font: font, textColor: textColor, lineLimit: lineLimit)
        register(view)
        return view
    }

    func updateNSView(_ nsView: LinkTextView, context: Context) {
        nsView.apply(text: text, font: font, textColor: textColor, lineLimit: lineLimit)
    }
}

/// A non-interactive text view that lays out the message and answers which URL,
/// if any, sits under a given point. Selection and editing are off so it behaves
/// like the plain `Text` it replaces; the click monitor drives link opening.
final class LinkTextView: NSTextView {
    convenience init() {
        // Build the full text-kit stack ourselves so a known layout manager and
        // container are wired up for hit-testing.
        let storage = NSTextStorage()
        let layout = NSLayoutManager()
        storage.addLayoutManager(layout)
        let container = NSTextContainer(size: NSSize(width: 0, height: CGFloat.greatestFiniteMagnitude))
        container.widthTracksTextView = true
        layout.addTextContainer(container)
        self.init(frame: .zero, textContainer: container)
    }

    override init(frame frameRect: NSRect, textContainer container: NSTextContainer?) {
        super.init(frame: frameRect, textContainer: container)
        isEditable = false
        isSelectable = false
        drawsBackground = false
        textContainerInset = .zero
        self.textContainer?.lineFragmentPadding = 0
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    // Wrap to the SwiftUI-given width and let the height follow the content.
    override var intrinsicContentSize: NSSize {
        guard let container = textContainer, let layoutManager else { return super.intrinsicContentSize }
        layoutManager.ensureLayout(for: container)
        let used = layoutManager.usedRect(for: container).size
        return NSSize(width: NSView.noIntrinsicMetric, height: ceil(used.height))
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        textContainer?.containerSize = NSSize(width: newSize.width, height: CGFloat.greatestFiniteMagnitude)
        invalidateIntrinsicContentSize()
    }

    func apply(text: String, font: NSFont, textColor: NSColor, lineLimit: Int) {
        let attributed = NSMutableAttributedString(string: text)
        let full = NSRange(location: 0, length: attributed.length)
        attributed.addAttribute(.font, value: font, range: full)
        attributed.addAttribute(.foregroundColor, value: textColor, range: full)

        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = lineLimit > 0 ? .byTruncatingTail : .byWordWrapping
        attributed.addAttribute(.paragraphStyle, value: paragraph, range: full)

        textContainer?.maximumNumberOfLines = lineLimit

        for match in Self.detector?.matches(in: text, range: full) ?? [] {
            guard let url = match.url else { continue }
            attributed.addAttribute(.link, value: url, range: match.range)
            attributed.addAttribute(.underlineStyle, value: NSUnderlineStyle.single.rawValue, range: match.range)
        }

        textStorage?.setAttributedString(attributed)
        invalidateIntrinsicContentSize()
    }

    /// The URL drawn under `windowPoint`, if the point falls on a linked glyph.
    func url(atWindowPoint windowPoint: NSPoint) -> URL? {
        guard let layoutManager, let textContainer else { return nil }
        let local = convert(windowPoint, from: nil)
        guard bounds.contains(local) else { return nil }
        let index = layoutManager.characterIndex(
            for: local,
            in: textContainer,
            fractionOfDistanceBetweenInsertionPoints: nil
        )
        guard index < (textStorage?.length ?? 0) else { return nil }
        // Make sure the point is within the laid-out glyph, not the empty space
        // past the end of a short line that maps to the nearest character.
        let glyphRect = layoutManager.boundingRect(
            forGlyphRange: NSRange(location: index, length: 1),
            in: textContainer
        )
        guard glyphRect.contains(local) else { return nil }
        return textStorage?.attribute(.link, at: index, effectiveRange: nil) as? URL
    }

    private static let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
}
