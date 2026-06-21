import AppKit
import MunkelKit
import SwiftUI

/// The full (hover-expanded) view: avatar, sender, and either the message text
/// or — for an image message — a picture (single) or thumbnail grid (album),
/// each cell upgrading from its inline thumbnail to full resolution as it loads
/// from R2. Copying lives in the persistent strip button; clicking the message
/// opens the inline reply field (see MessageNotchContainer/NotchPresenter).
struct MessageNotchView: View {
    let message: IncomingMessage
    @ObservedObject var model: MessageDisplayModel

    /// The expanded panel width (matches the container's `tickerWindow`).
    private let contentWidth: CGFloat = 250
    /// Horizontal inset of the message body — keep in sync with the
    /// `.padding(.horizontal, hInset)` on textBody/imageBody. The picture(s)
    /// fit this inset width, not the full panel width, or the album sits flush
    /// against the right edge while keeping a left margin.
    private let hInset: CGFloat = 6
    private let gridSpacing: CGFloat = 6
    /// Usable width for the picture(s): the panel minus both body insets.
    private var imageWidth: CGFloat { contentWidth - 2 * hInset }

    var body: some View {
        if message.isImage {
            imageBody
        } else {
            textBody
        }
    }

    private var textBody: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(name: message.sender, imageData: message.avatarData)

            VStack(alignment: .leading, spacing: 6) {
                VStack(alignment: .leading, spacing: 2) {
                    header
                    LinkText(
                        text: message.text,
                        font: .systemFont(ofSize: 14, weight: .medium),
                        textColor: .white,
                        lineLimit: 6
                    ) { [weak model] view in model?.registerLinkHost(view) }
                }
                if let url = firstURL(in: message.text) {
                    LinkPreviewCard(model: model, url: url)
                }
            }

            Spacer(minLength: 12)
        }
        .padding(.horizontal, hInset)
        .padding(.vertical, 4)
    }

    /// Header on top, the picture(s) below, an optional caption underneath.
    private var imageBody: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                AvatarView(name: message.sender, imageData: message.avatarData, size: 18)
                header
                Spacer(minLength: 4)
            }

            imageContent

            if !message.text.isEmpty {
                LinkText(
                    text: message.text,
                    font: .systemFont(ofSize: 13, weight: .medium),
                    textColor: .white,
                    lineLimit: 4
                ) { [weak model] view in model?.registerLinkHost(view) }
            }
        }
        .padding(.horizontal, hInset)
        .padding(.vertical, 4)
    }

    /// Every picture is a square, fill-cropped thumbnail — a lone image included
    /// — so a row of mixed aspect ratios stays tidy and a single image lines up
    /// with album cells; the hover preview shows each one whole. Up to four per
    /// row, fewer-but-larger cells for smaller albums.
    ///
    /// A non-lazy VStack/HStack grid (not LazyVGrid): an album is at most eight
    /// cells, so laziness buys nothing, and LazyVGrid's per-cell `.onHover` only
    /// fires reliably for the first cell — which hid the copy glyph on the rest.
    @ViewBuilder private var imageContent: some View {
        let count = message.images.count
        let columnCount = min(4, count)
        let side = (imageWidth - CGFloat(columnCount - 1) * gridSpacing) / CGFloat(columnCount)
        let radius: CGFloat = count == 1 ? 10 : 8
        let rows = stride(from: 0, to: count, by: columnCount).map { start in
            Array(message.images[start..<min(start + columnCount, count)])
        }
        VStack(alignment: .leading, spacing: gridSpacing) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: gridSpacing) {
                    ForEach(row) { img in
                        AlbumCell(model: model, image: img, cornerRadius: radius,
                                  displaySize: CGSize(width: side, height: side))
                    }
                }
            }
        }
        .frame(width: imageWidth, alignment: .leading)
    }

    private var header: some View {
        HStack(spacing: 4) {
            Text(message.sender)
                .font(.system(size: 11, weight: .semibold))
            // Globe: everyone saw this. Lock: only you did. No .help — tooltip
            // windows leak into screen shares.
            Image(systemName: message.isDirect ? "lock.fill" : "globe")
                .font(.system(size: 9))
            Text("·")
            Circle()
                .fill(message.groupColor)
                .frame(width: 6, height: 6)
            Text(message.group)
                .font(.system(size: 10, design: .monospaced))
                .lineLimit(1)
        }
        .foregroundStyle(.white.opacity(0.55))
    }
}

/// One image cell: paints its inline thumbnail instantly, then fetches its full
/// resolution from R2 (once, cached on the model) and swaps it in. A spinner
/// shows while loading, a warning glyph if the fetch failed. Decoding is off
/// the main actor through ImageCodec's bomb-safe thumbnailer.
struct AlbumCell: View {
    @ObservedObject var model: MessageDisplayModel
    let image: IncomingImage
    /// Corner radius for the picture. Applied to the image here (not by the
    /// caller) so the copy glyph can sit OUTSIDE the rounded clip — a clip on
    /// the whole cell would shave the glyph's top-right corner.
    let cornerRadius: CGFloat
    /// Final on-screen size of the picture. Sized + clipped HERE (not by the
    /// caller) so the frame constrains the layout BEFORE the clip: a `.fill`
    /// image reports an oversized intrinsic frame, and clipping before the frame
    /// let that overflow spill over and overlap neighbouring content.
    let displaySize: CGSize

    @State private var decoded: CGImage?
    @State private var hovering = false

    private var isLoaded: Bool { model.fullImages[image.id] != nil }
    private var didFail: Bool { model.failedImages.contains(image.id) }

        private let glyphDiameter: CGFloat = 20

    /// The animated bytes to play, once they've loaded for an animated image;
    /// nil keeps the still thumbnail showing.
    private var animatedFull: Data? {
        guard image.isAnimated, let full = model.fullImages[image.id] else { return nil }
        return full
    }

    var body: some View {
        ZStack {
            if let animatedFull {
                AnimatedImageView(data: animatedFull, contentMode: .fill)
            } else if let decoded {
                Image(decorative: decoded, scale: 1)
                    .resizable()
                    .interpolation(.medium)
                    .aspectRatio(contentMode: .fill)
            } else {
                Rectangle().fill(.white.opacity(0.08))
            }
            if !isLoaded, !didFail {
                ProgressView().controlSize(.small).tint(.white.opacity(0.8))
            } else if didFail {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        // Size + round the picture HERE, before the copy-glyph overlay: the
        // frame pins the layout to the final cell size so a `.fill` image's
        // overflow can't spill onto neighbours, the clip crops that overflow and
        // rounds the corner, and the glyph (added next, outside the clip) is
        // never shaved by the rounding.
        .frame(width: displaySize.width, height: displaySize.height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        // Per-image copy: a hover-revealed glyph on the picture, mirroring the
        // history rows. The glyph is purely visual — clicking it is caught by
        // NotchPresenter's event monitor, which matches the hover-registered
        // hit target laid out beneath it (a SwiftUI Button here would sit inside
        // the reply marker and a click would both copy AND open the reply).
        .overlay(alignment: .topTrailing) { copyGlyph }
        // Hit-test the cell as its plain square. `.clipShape` only clips the
        // pixels: a `.fill` image still reports its oversized (overflowing) frame
        // for hit-testing, so without this the wider image of an adjacent cell
        // (drawn on top) steals the hover over this cell's edge — the glyph then
        // only appeared near the side the neighbour's overflow didn't reach.
        .contentShape(Rectangle())
        // One hover handler drives both per-image affordances: the copy glyph
        // (local `hovering`) and the large Quick-Look preview (ImagePreviewOverlay,
        // rendered free-floating below the notch in the same capture-excluded
        // panel window). The preview's debounce + owner-checked dismissal live on
        // the model, so a dropped leave or teardown can't resurrect a cleared one.
        .onHover { inside in
            hovering = inside
            if inside {
                model.requestPreview(image.id)
            } else {
                model.endPreview(forCell: image.id)
            }
        }
        .task { await load() }
    }

    /// Copy affordance: hidden until hover (or while its checkmark lingers),
    /// flashing the checkmark on this image alone via copiedImageID. The hit
    /// target only exists while hovered — NotchPresenter copies the image whose
    /// target the click lands in, resolving full-vs-thumb at that moment.
    private var copyGlyph: some View {
        let isCopied = model.copiedImageID == image.id
        let show = hovering || isCopied
        return CopyGlyph(copied: isCopied, diameter: glyphDiameter)
            .opacity(show ? 1 : 0)
            .background {
                if hovering {
                    ImageCopyHitTarget(
                        id: image.id,
                        // [weak model]: the resolve closure is stored on the
                        // model (via imageCopyTargets) — a strong capture would
                        // retain-cycle the model and leak its full-res image
                        // bytes past the message's RAM-only lifetime. At click
                        // time the monitor already holds the live model, so the
                        // weak ref is never nil then; after teardown it lets the
                        // model deallocate.
                        resolve: { [weak model] in model?.fullImages[image.id] ?? image.thumb }
                    ) { [weak model] id, resolve, view in
                        model?.registerImageCopy(id: id, resolve: resolve, view: view)
                    }
                }
            }
            .padding(4)
            .animation(.easeInOut(duration: 0.12), value: show)
    }

    private func load() async {
        // Instant preview from the inline thumbnail.
        if decoded == nil {
            let thumb = image.thumb
            decoded = await Task.detached { ImageCodec.decode(thumb, maxPixels: 400) }.value
        }
        // Full resolution: use the cache, else fetch once via the model's loader.
        // An animated image plays from its raw bytes (AnimatedImageView), so a
        // still full-res decode would just be thrown away — skip it.
        if let full = model.fullImages[image.id] {
            if image.isAnimated { return }
            decoded = await Task.detached { ImageCodec.decode(full, maxPixels: 1400) }.value
            return
        }
        guard !didFail, let loader = model.imageLoaders[image.id] else { return }
        if let data = await loader() {
            model.fullImages[image.id] = data
            if image.isAnimated { return }
            decoded = await Task.detached { ImageCodec.decode(data, maxPixels: 1400) }.value
        } else {
            model.failedImages.insert(image.id)
        }
    }
}

/// Plays animated image bytes (an animated GIF) in an NSImageView, which loops
/// the frames on its own — SwiftUI's `Image` only ever paints a still CGImage.
/// Used for the full-resolution view once the animated bytes have loaded; the
/// inline thumbnail keeps showing as a still frame until then.
struct AnimatedImageView: NSViewRepresentable {
    let data: Data
    let contentMode: ContentMode

    func makeNSView(context: Context) -> NSImageView {
        let view = NSImageView()
        view.imageScaling = contentMode == .fill ? .scaleProportionallyUpOrDown : .scaleProportionallyDown
        view.animates = true
        view.imageFrameStyle = .none
        view.image = NSImage(data: data)
        return view
    }

    func updateNSView(_ nsView: NSImageView, context: Context) {
        nsView.imageScaling = contentMode == .fill ? .scaleProportionallyUpOrDown : .scaleProportionallyDown
        if nsView.image == nil { nsView.image = NSImage(data: data) }
    }
}

/// Invisible NSView laid out under an album image's copy glyph. Like AreaMarker
/// but carries the image id and a `resolve` closure (full bytes if loaded, else
/// the thumbnail), registered into the model so the click monitor can copy the
/// matching image (NSHostingView's hitTest can't surface it). Used by both the
/// current message's `AlbumCell` and the history's `HistoryAlbumCell`.
struct ImageCopyHitTarget: NSViewRepresentable {
    let id: String
    let resolve: () -> Data
    let register: (String, @escaping () -> Data, NSView) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        register(id, resolve, view)
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

/// A small card under a text message that links out: the page's Open Graph
/// title and, if present, its share image. Scraped once on appear (cached on
/// the model) and silently absent until — and unless — that succeeds, so a
/// link with no preview just shows the bare text above. Clicking opens the URL.
struct LinkPreviewCard: View {
    @ObservedObject var model: MessageDisplayModel
    let url: URL

    @State private var image: CGImage?

    private var preview: LinkPreviewData? {
        // Outer optional: not yet fetched. Inner: fetched but had no OG data.
        (model.linkPreviews[url.absoluteString] ?? nil)
    }

    var body: some View {
        Group {
            if let preview {
                content(preview)
            }
        }
        .task(id: url) { await model.loadLinkPreview(for: url) }
    }

    private func content(_ preview: LinkPreviewData) -> some View {
        HStack(spacing: 8) {
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .interpolation(.medium)
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(preview.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(preview.siteName ?? (url.host ?? url.absoluteString))
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.55))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onTapGesture { NSWorkspace.shared.open(preview.url) }
        .task(id: preview.imageURL) { await loadImage(preview.imageURL) }
    }

    private func loadImage(_ imageURL: URL?) async {
        guard let imageURL else { return }
        guard let (data, _) = try? await URLSession.shared.data(from: imageURL) else { return }
        image = await Task.detached { ImageCodec.decode(data, maxPixels: 200) }.value
    }
}

/// A tiny thumbnail-only image (no R2 fetch) for the collapsed teaser strip.
struct NotchThumb: View {
    let thumb: Data
    let side: CGFloat

    @State private var decoded: CGImage?

    var body: some View {
        Group {
            if let decoded {
                Image(decorative: decoded, scale: 1)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Rectangle().fill(.white.opacity(0.08))
            }
        }
        .frame(width: side, height: side)
        .clipped()
        .task {
            let data = thumb
            let pixels = Int(side * 2)
            decoded = await Task.detached { ImageCodec.decode(data, maxPixels: pixels) }.value
        }
    }
}
