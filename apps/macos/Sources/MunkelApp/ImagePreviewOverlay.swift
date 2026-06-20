import AppKit
import MunkelKit
import SwiftUI

/// The free-floating "Quick Look" preview: when an `AlbumCell` is hovered it
/// sets `model.previewImageID`, and this view — mounted by ``NotchHostingContent``
/// as a sibling of the masked notch (so it escapes the NotchShape clip yet stays
/// inside the capture-excluded panel window) — pops the enlarged image just below
/// the notch. Hover-driven and `allowsHitTesting(false)`, so it is a pure peek:
/// it never steals a click and dismisses the moment the pointer leaves the cell
/// (or any teardown path clears `previewImageID`).
///
/// Capture safety: this lives in the notch panel window, whose `sharingType` is
/// `.none` from birth (``NotchPanelWindow``); the `.excludedFromScreenCapture()`
/// below is the same belt-and-suspenders backup the rest of the notch uses. No
/// `NSPanel`/`QLPreviewPanel`/`.help()` — those draw in their own window and
/// would leak into a screen share while the notch itself stays hidden.
struct ImagePreviewOverlay: View {
    @ObservedObject var model: MessageDisplayModel
    /// The current message's images, to resolve `previewImageID` → image.
    let images: [IncomingImage]

    var body: some View {
        // The reader's size is the room left BELOW the notch chrome (the parent
        // pads it down by the measured clearance), so the card can be bounded to
        // what actually fits and never runs off the bottom of the screen.
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

/// One enlarged image card. Paints its inline thumbnail immediately, then swaps
/// in the full resolution the cell already fetched into `model.fullImages`
/// (consumes the shared cache only — never triggers a second R2 fetch).
private struct PreviewCard: View {
    @ObservedObject var model: MessageDisplayModel
    let image: IncomingImage
    /// Space available below the notch chrome (from the overlay's GeometryReader).
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
        // Structured so SwiftUI cancels it on teardown / image switch — which is
        // what makes the `Task.isCancelled` guard in `decodeFull` meaningful.
        // Thumbnail first, then wait for the cell's full bytes and upgrade once.
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

    /// The image's aspect scaled to fill nearly all the room available below the
    /// notch. For image messages the panel spans the full screen width (see
    /// ``NotchScreenMetrics/panelFrame(for:wide:)``), so `available` is roughly the
    /// whole screen and the preview lands near-fullscreen — only a small gutter
    /// keeps it off the edges. A big screenshot is downscaled to fit; a small
    /// image is still upscaled at most 3× so it stays sharp instead of blowing up
    /// to a blurry wall. The full image is itself capped at
    /// `ImageCodec.maxFullPixels` on the wire, which bounds the crispest result.
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
