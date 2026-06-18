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

    /// Matches the expanded container width.
    private let contentWidth: CGFloat = 250
    private let gridSpacing: CGFloat = 6

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
        .padding(.horizontal, 6)
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
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

    /// A lone image fills the width at its own aspect; an album is a 2-column
    /// grid of square cells.
    @ViewBuilder private var imageContent: some View {
        if message.images.count == 1, let only = message.images.first {
            let size = fittedSize(width: only.width, height: only.height)
            AlbumCell(model: model, image: only, fill: false)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        } else {
            let side = (contentWidth - gridSpacing) / 2
            let columns = [
                GridItem(.fixed(side), spacing: gridSpacing),
                GridItem(.fixed(side), spacing: gridSpacing),
            ]
            LazyVGrid(columns: columns, alignment: .leading, spacing: gridSpacing) {
                ForEach(message.images) { img in
                    AlbumCell(model: model, image: img, fill: true)
                        .frame(width: side, height: side)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            .frame(width: contentWidth, alignment: .leading)
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
        guard w > 0, h > 0 else { return CGSize(width: contentWidth, height: contentWidth * 0.6) }
        let scale = min(contentWidth / w, maxHeight / h)
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

    private var isLoaded: Bool { model.fullImages[image.id] != nil }
    private var didFail: Bool { model.failedImages.contains(image.id) }

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
        .task { await load() }
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
