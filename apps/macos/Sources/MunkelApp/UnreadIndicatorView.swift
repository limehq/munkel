import SwiftUI

/// History anchor: a small white countdown ring (on a faint track) lifted into
/// the black menu-bar strip beside the notch cutout, where a sender avatar sits
/// for an incoming
/// message. It widens the notch horizontally instead of growing it downward.
/// Hovering or clicking it reopens the notch on the history (wired in
/// NotchPresenter). The ring's arc depletes from full to empty as the newest
/// message ages toward the 60s history window: when it empties, the whole
/// history vanishes and the anchor tears down — so it reads as "this much time
/// left before the chat disappears."
struct UnreadIndicatorView: View {
    /// Hardware cutout size; drives the horizontal width and the strip lift.
    var notchSize: CGSize = .zero
    /// 1 = the newest message just arrived (full ring), 0 = about to age out.
    /// Driven once a second by NotchPresenter's prune loop.
    var progress: Double = 1

    private let ringSize: CGFloat = 11
    private let ringWidth: CGFloat = 2.5

    var body: some View {
        if notchSize.height > 0 {
            // A flat 1pt strip. The hosting container imposes the message width
            // (frame width: tickerWindow), so the dot mode is exactly as wide as
            // a message and the morph is a pure vertical collapse at constant
            // width. The panel drops its bottom inset, so no downward growth.
            // The ring rides in the leading side zone — beside the cutout, where
            // the sender avatar sits — lifted onto the menu-bar line.
            Color.clear
                .frame(width: notchSize.width, height: 1)
                .overlay(alignment: .topLeading) {
                    ring.offset(y: -(notchSize.height + ringSize) / 2)
                }
        } else {
            // No-notch screens use the floating pill chrome; just show the ring.
            ring.padding(2)
        }
    }

    private var ring: some View {
        ZStack {
            // Faint track so the full circle stays legible the whole time — you
            // always see it was once a complete ring.
            Circle()
                .stroke(Color.white.opacity(0.18), lineWidth: ringWidth)
            // The depleting arc on top, fully white. Starts at 12 o'clock and
            // shortens back toward there as it empties.
            Circle()
                .trim(from: 0, to: max(0, min(1, progress)))
                .stroke(Color.white, style: StrokeStyle(lineWidth: ringWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: ringSize, height: ringSize)
    }
}

#Preview {
    VStack(spacing: 20) {
        UnreadIndicatorView(notchSize: CGSize(width: 200, height: 32), progress: 1)
        UnreadIndicatorView(notchSize: CGSize(width: 200, height: 32), progress: 0.6)
        UnreadIndicatorView(notchSize: CGSize(width: 200, height: 32), progress: 0.15)
    }
    .frame(width: 320, height: 160)
    .background(Color.black)
}
