import SwiftUI

/// Scrolling ticker for the compact notch state: the incoming message text
/// runs news-ticker-style right of the notch in a seamless loop, with faded
/// edges. Short texts that fit are shown statically.
struct CompactMessageTicker: View {
    let text: String

    private let maxWidth: CGFloat = 110
    private let pointsPerSecond: CGFloat = 26
    private let gap: CGFloat = 30
    /// Lets the avatar entrance settle before the text starts moving.
    private let startDelay: TimeInterval = 0.9

    @State private var textWidth: CGFloat = .zero
    @State private var appearedAt = Date()

    var body: some View {
        Group {
            if textWidth > maxWidth {
                TimelineView(.animation) { context in
                    let cycleLength = textWidth + gap
                    let elapsed = max(0, context.date.timeIntervalSince(appearedAt) - startDelay)
                    let phase = (CGFloat(elapsed) * pointsPerSecond).truncatingRemainder(dividingBy: cycleLength)
                    HStack(spacing: gap) {
                        tickerText.fixedSize()
                        tickerText.fixedSize()
                    }
                    .offset(x: -phase)
                }
                .frame(width: maxWidth, alignment: .leading)
                .mask(edgeFade)
            } else {
                tickerText
            }
        }
        .background {
            // Invisible twin, just to measure the text's natural width.
            tickerText
                .fixedSize()
                .hidden()
                .onGeometryChange(for: CGFloat.self) { proxy in
                    proxy.size.width
                } action: { width in
                    textWidth = width
                }
        }
        .onAppear { appearedAt = Date() }
    }

    private var tickerText: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.85))
            .lineLimit(1)
    }

    private var edgeFade: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0),
                .init(color: .black, location: 0.07),
                .init(color: .black, location: 0.93),
                .init(color: .clear, location: 1),
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}
