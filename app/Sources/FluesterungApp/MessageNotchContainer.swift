import SwiftUI

/// Drives the in-place morph between the one-line teaser and the full
/// message view inside a single expanded notch.
@MainActor
final class MessageDisplayModel: ObservableObject {
    @Published var fullyExpanded = false
}

/// The notch content for one message: a slim teaser line below the notch
/// (avatar + once-scrolling text); hovering swells it into the full view
/// with the copy button.
struct MessageNotchContainer: View {
    @ObservedObject var model: MessageDisplayModel
    let message: IncomingMessage
    var onTeaserFinished: () -> Void

    var body: some View {
        Group {
            if model.fullyExpanded {
                MessageNotchView(message: message)
            } else {
                VStack(alignment: .leading, spacing: 5) {
                    CompactAvatarView(name: message.sender)
                    TickerText(text: message.text, onFinished: onTeaserFinished)
                }
                .padding(.horizontal, 6)
                .padding(.vertical, 4)
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.fullyExpanded)
    }
}
