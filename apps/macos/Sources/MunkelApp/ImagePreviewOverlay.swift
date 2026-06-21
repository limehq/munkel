import AppKit
import MunkelKit
import SwiftUI

struct ImagePreviewOverlay: View {
    @ObservedObject var model: MessageDisplayModel
    /// The current message's images. Past-message pictures are resolved live from
    /// the model's history (see `resolvedImages`), so hovering either one previews.
    let images: [IncomingImage]

    /// Current-message images plus every picture still in the live history, so a
    /// hover on a past image previews exactly like the current message's. Lookup
    /// is by r2Key (unique per image), so the two sets never collide.
    private var resolvedImages: [IncomingImage] {
        images + model.history.flatMap(\.images)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                if let id = model.previewImageID,
                   let image = resolvedImages.first(where: { $0.id == id }) {
                    PreviewCard(model: model, image: image, available: proxy.size)
                        .id(id)
                        .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .center)))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .colorScheme(.dark)
        .excludedFromScreenCapture()
    }
}

private struct PreviewCard: View {
    @ObservedObject var model: MessageDisplayModel
    let image: IncomingImage
    let available: CGSize

    @State private var decoded: CGImage?

    private var didFail: Bool { model.failedImages.contains(image.id) }
    private var fullLoaded: Bool { model.fullImages[image.id] != nil }

    var body: some View {
        let size = fittedSize(in: available)
        ZStack {
            if let decoded {
                Image(decorative: decoded, scale: 1)
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
            } else {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.black.opacity(0.55))
            }
            if !fullLoaded, !didFail {
                ProgressView().controlSize(.regular).tint(.white.opacity(0.85))
            } else if didFail, decoded == nil {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 22))
                    .foregroundStyle(.white.opacity(0.6))
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(.white.opacity(0.12), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.55), radius: 28, x: 0, y: 12)
        .task(id: image.id) {
            await decodeThumb()
            for await images in model.$fullImages.values {
                if images[image.id] != nil {
                    await decodeFull()
                    break
                }
            }
        }
    }

    private func decodeThumb() async {
        guard decoded == nil else { return }
        let thumb = image.thumb
        let img = await Task.detached { ImageCodec.decode(thumb, maxPixels: 700) }.value
        guard !Task.isCancelled else { return }
        decoded = img
    }

    private func decodeFull() async {
        guard let full = model.fullImages[image.id] else { return }
        let img = await Task.detached { ImageCodec.decode(full, maxPixels: ImageCodec.maxFullPixels) }.value
        guard !Task.isCancelled else { return }
        decoded = img
    }

    /// The picture's aspect, scaled to fill the screen as far as it goes WITHOUT
    /// growing past its own native pixel size: a large screenshot spans nearly
    /// the whole display, a small image shows crisp at 1:1 instead of blowing up
    /// blurry. Both axes are bounded by the (centered) screen minus a slim gutter,
    /// so the result is "as wide as the image, up to 100% of the screen, aspect
    /// preserved". The full image is itself capped at `ImageCodec.maxFullPixels`
    /// on the wire, which bounds the crispest result.
    private func fittedSize(in available: CGSize) -> CGSize {
        let w = CGFloat(max(image.width, 1))
        let h = CGFloat(max(image.height, 1))
        let gutter: CGFloat = 24
        let maxW = max(80, available.width - 2 * gutter)
        let maxH = max(80, available.height - 2 * gutter)
        // Cap at 1: grow to fill the screen but never upscale beyond the image's
        // native size ("only as wide as the image actually is").
        let scale = min(maxW / w, maxH / h, 1)
        return CGSize(width: max(1, w * scale), height: max(1, h * scale))
    }
}
