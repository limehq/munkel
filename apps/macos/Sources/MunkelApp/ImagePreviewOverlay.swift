import AppKit
import MunkelKit
import SwiftUI

struct ImagePreviewOverlay: View {
    @ObservedObject var model: MessageDisplayModel
    let images: [IncomingImage]

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                if let id = model.previewImageID,
                   let image = images.first(where: { $0.id == id }) {
                    PreviewCard(model: model, image: image, available: proxy.size)
                        .id(id)
                        .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .top)))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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

    private func fittedSize(in available: CGSize) -> CGSize {
        let w = CGFloat(max(image.width, 1))
        let h = CGFloat(max(image.height, 1))
        let horizontalGutter: CGFloat = 48
        let bottomGutter: CGFloat = 40
        let maxW = max(80, available.width - 2 * horizontalGutter)
        let maxH = max(80, available.height - bottomGutter)
        let scale = min(min(maxW / w, maxH / h), 3)
        return CGSize(width: max(1, w * scale), height: max(1, h * scale))
    }
}
