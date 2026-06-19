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

            VStack(alignment: .leading, spacing: 2) {
                header
                Text(message.text)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(6)
                    .fixedSize(horizontal: false, vertical: true)
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
                Text(message.text)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, hInset)
        .padding(.vertical, 4)
    }

    /// A lone image fills the width at its own aspect; an album is a grid of
    /// square cells, up to four per row.
    @ViewBuilder private var imageContent: some View {
        if message.images.count == 1, let only = message.images.first {
            let size = fittedSize(width: only.width, height: only.height)
            AlbumCell(model: model, image: only, fill: false)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            // Pack up to four thumbnails per row; smaller albums use fewer,
            // larger columns (2 → two-up, 3 → three-up, 4+ → four per row).
            let columnCount = min(4, message.images.count)
            let side = (imageWidth - CGFloat(columnCount - 1) * gridSpacing) / CGFloat(columnCount)
            let columns = Array(
                repeating: GridItem(.fixed(side), spacing: gridSpacing),
                count: columnCount
            )
            LazyVGrid(columns: columns, alignment: .leading, spacing: gridSpacing) {
                ForEach(message.images) { img in
                    AlbumCell(model: model, image: img, fill: true)
                        .frame(width: side, height: side)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            .frame(width: imageWidth, alignment: .leading)
        }
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

    /// A lone image's display size: its aspect scaled to fit the bounding box
    /// (never upscaled past it).
    private func fittedSize(width: Int, height: Int) -> CGSize {
        let w = CGFloat(width)
        let h = CGFloat(height)
        let maxHeight: CGFloat = 260
        guard w > 0, h > 0 else { return CGSize(width: imageWidth, height: imageWidth * 0.6) }
        let scale = min(imageWidth / w, maxHeight / h)
        return CGSize(width: max(1, w * scale), height: max(1, h * scale))
    }
}

/// One image cell: paints its inline thumbnail instantly, then fetches its full
/// resolution from R2 (once, cached on the model) and swaps it in. A spinner
/// shows while loading, a warning glyph if the fetch failed. Decoding is off
/// the main actor through ImageCodec's bomb-safe thumbnailer.
struct AlbumCell: View {
    @ObservedObject var model: MessageDisplayModel
    let image: IncomingImage
    /// Grid cells fill+crop to a square; a lone image fits its aspect.
    let fill: Bool

    @State private var decoded: CGImage?
    @State private var hovering = false

    private var isLoaded: Bool { model.fullImages[image.id] != nil }
    private var didFail: Bool { model.failedImages.contains(image.id) }

    /// Matches the history rows' copy glyph.
    private let glyphDiameter: CGFloat = 20

    var body: some View {
        ZStack {
            if let decoded {
                Image(decorative: decoded, scale: 1)
                    .resizable()
                    .interpolation(.medium)
                    .aspectRatio(contentMode: fill ? .fill : .fit)
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
        .clipped()
        // Per-image copy: a hover-revealed glyph on the picture, mirroring the
        // history rows. The glyph is purely visual — clicking it is caught by
        // NotchPresenter's event monitor, which matches the hover-registered
        // hit target laid out beneath it (a SwiftUI Button here would sit inside
        // the reply marker and a click would both copy AND open the reply).
        .overlay(alignment: .topTrailing) { copyGlyph }
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
        if let full = model.fullImages[image.id] {
            decoded = await Task.detached { ImageCodec.decode(full, maxPixels: 1400) }.value
            return
        }
        guard !didFail, let loader = model.imageLoaders[image.id] else { return }
        if let data = await loader() {
            model.fullImages[image.id] = data
            decoded = await Task.detached { ImageCodec.decode(data, maxPixels: 1400) }.value
        } else {
            model.failedImages.insert(image.id)
        }
    }
}

/// Invisible NSView laid out under an album image's copy glyph. Like AreaMarker
/// but carries the image id and a `resolve` closure (full bytes if loaded, else
/// the thumbnail), registered into the model so the click monitor can copy the
/// matching image (NSHostingView's hitTest can't surface it).
private struct ImageCopyHitTarget: NSViewRepresentable {
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
            let thumb = thumb
            let pixels = Int(side * 2)
            decoded = await Task.detached { ImageCodec.decode(thumb, maxPixels: pixels) }.value
        }
    }
}
