import SwiftUI

/// Drives the in-place morph between the one-line teaser and the full
/// message view inside a single expanded notch.
@MainActor
final class MessageDisplayModel: ObservableObject {
    @Published var fullyExpanded = false
}

/// The notch content for one message. Teaser state: the avatar sits at
/// menu-bar height directly LEFT of the hardware notch (drawn into the black
/// strip via overlay offset), while the once-scrolling text line runs below
/// the notch. Hovering swells everything into the full message view.
struct MessageNotchContainer: View {
    @ObservedObject var model: MessageDisplayModel
    let message: IncomingMessage
    /// Hardware notch cutout size, measured from NSScreen; .zero on Macs
    /// without a notch (DynamicNotchKit then uses its floating style).
    let notchSize: CGSize
    var onTeaserFinished: () -> Void

    private let avatarSize: CGFloat = 20
    private let tickerWindow: CGFloat = 220
    /// Horizontal space the library adds around the expanded content:
    /// 15pt safe-area inset + 15pt notch-shape corner padding per side.
    private let libraryLeadingInset: CGFloat = 30

    var body: some View {
        Group {
            if model.fullyExpanded {
                MessageNotchView(message: message)
            } else if notchSize.height > 0 {
                notchedTeaser
            } else {
                fallbackTeaser
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.fullyExpanded)
    }

    /// Text below the notch; avatar lifted into the strip left of the cutout.
    private var notchedTeaser: some View {
        TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
            .padding(.vertical, 4)
            .overlay(alignment: .topLeading) {
                CompactAvatarView(name: message.sender)
                    .offset(x: avatarOffsetX, y: avatarOffsetY)
            }
    }

    /// Macs without a notch: keep the avatar in-row, nothing to tuck beside.
    private var fallbackTeaser: some View {
        HStack(spacing: 10) {
            CompactAvatarView(name: message.sender)
            TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
        }
        .padding(.vertical, 4)
    }

    /// Centers the avatar in the black zone between the shape's left edge
    /// and the hardware cutout — never behind the camera housing.
    private var avatarOffsetX: CGFloat {
        let shapeWidth = tickerWindow + libraryLeadingInset * 2
        let sideZone = max(avatarSize + 8, (shapeWidth - notchSize.width) / 2)
        return -libraryLeadingInset + (sideZone - avatarSize) / 2
    }

    /// Vertically centers the avatar in the menu-bar-height strip above.
    private var avatarOffsetY: CGFloat {
        -(notchSize.height + avatarSize) / 2
    }
}
