import SwiftUI

struct TickerText: View {
    let text: String
    var windowWidth: CGFloat = 190
    var onFinished: () -> Void = {}

    private let pointsPerSecond: CGFloat = 24
    private let startDelay: TimeInterval = 1.6
    private let endPadding: CGFloat = 14

    @State private var textWidth: CGFloat = .zero
    @State private var appearedAt = Date()
    @State private var finished = false

    var body: some View {
        Group {
            if textWidth == .zero {
                displayedText
                    .fixedSize()
                    .frame(width: windowWidth, alignment: .leading)
                    .clipped()
            } else if textWidth > windowWidth {
                TimelineView(.animation(minimumInterval: nil, paused: finished)) { context in
                    let maxOffset = textWidth - windowWidth + endPadding
                    let elapsed = max(0, context.date.timeIntervalSince(appearedAt) - startDelay)
                    let offset = min(CGFloat(elapsed) * pointsPerSecond, maxOffset)
                    displayedText
                        .fixedSize()
                        .offset(x: -offset)
                        .frame(width: windowWidth, alignment: .leading)
                        .clipped()
                        .mask(edgeFade(fadeLeading: offset > 0.5))
                        .onChange(of: offset >= maxOffset) { _, done in
                            if done {
                                finished = true
                                onFinished()
                            }
                    }
                }
                .onAppear { appearedAt = Date() }
            } else {
                displayedText
                    .onAppear { onFinished() }
            }
        }
        .background {
            displayedText
                .fixedSize()
                .hidden()
                .onGeometryChange(for: CGFloat.self) { proxy in
                    proxy.size.width
                } action: { width in
                    textWidth = width
                }
        }
    }

    private var displayedText: some View {
        Text(text)
            .font(.system(size: 12, weight: .medium, design: .rounded))
            .foregroundStyle(.white.opacity(0.85))
            .lineLimit(1)
    }

    private func edgeFade(fadeLeading: Bool) -> LinearGradient {
        LinearGradient(
            stops: [
                .init(color: fadeLeading ? .clear : .black, location: 0),
                .init(color: .black, location: fadeLeading ? 0.04 : 0),
                .init(color: .black, location: 0.96),
                .init(color: .clear, location: 1),
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }
}
