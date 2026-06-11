import SwiftUI

/// Single-line message teaser below the notch: starts at the beginning of
/// the text and scrolls through exactly once, then stops at the end and
/// reports completion. Texts that fit are shown statically.
struct TickerText: View {
    let text: String
    var windowWidth: CGFloat = 190
    var onFinished: () -> Void = {}

    /// The teaser is a preview, not the reading surface — long messages are
    /// truncated; the full text lives in the hover-expanded view.
    private let previewLimit = 48
    private let pointsPerSecond: CGFloat = 30
    /// Lets the entrance animation settle before the text starts moving.
    private let startDelay: TimeInterval = 0.9

    @State private var textWidth: CGFloat = .zero
    @State private var appearedAt = Date()
    @State private var finished = false

    var body: some View {
        Group {
            if textWidth > windowWidth {
                TimelineView(.animation(minimumInterval: nil, paused: finished)) { context in
                    let maxOffset = textWidth - windowWidth
                    let elapsed = max(0, context.date.timeIntervalSince(appearedAt) - startDelay)
                    let offset = min(CGFloat(elapsed) * pointsPerSecond, maxOffset)
                    displayedText
                        .fixedSize()
                        .offset(x: -offset)
                        .onChange(of: offset >= maxOffset) { _, done in
                            if done {
                                finished = true
                                onFinished()
                            }
                        }
                }
                .frame(width: windowWidth, alignment: .leading)
                .clipped()
                .mask(edgeFade)
            } else {
                displayedText
                    .onAppear { onFinished() }
            }
        }
        .background {
            // Invisible twin, just to measure the text's natural width.
            displayedText
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

    private var displayedText: some View {
        Text(preview)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.85))
            .lineLimit(1)
    }

    private var preview: String {
        text.count > previewLimit ? text.prefix(previewLimit).trimmingCharacters(in: .whitespaces) + "…" : text
    }

    private var edgeFade: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .clear, location: 0),
                .init(color: .black, location: 0.03),
                .init(color: .black, location: 0.96),
                .init(color: .clear, location: 1),
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}
