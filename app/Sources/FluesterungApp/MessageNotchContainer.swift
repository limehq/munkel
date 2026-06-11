import AppKit
import SwiftUI

/// Drives the in-place morph between the one-line teaser and the full
/// message view inside a single expanded notch, plus the shared
/// copied-feedback state.
@MainActor
final class MessageDisplayModel: ObservableObject {
    @Published var fullyExpanded = false
    @Published var copied = false

    func copy(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        withAnimation(.spring(duration: 0.3)) { copied = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.spring(duration: 0.3)) { copied = false }
        }
    }
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
    /// Wide enough that the avatar (sitting at the content's leading edge,
    /// 30pt from the shape's left side) stays clear of the camera cutout:
    /// side zone = (tickerWindow + 60 − notchWidth) / 2 ≥ 55pt for ≤200pt notches.
    private let tickerWindow: CGFloat = 250

    var body: some View {
        Group {
            if model.fullyExpanded {
                // Same width as the teaser: hovering only grows downward.
                MessageNotchView(message: message)
                    .frame(width: tickerWindow, alignment: .leading)
            } else if notchSize.height > 0 {
                notchedTeaser
            } else {
                fallbackTeaser
            }
        }
        // The copy button lives permanently in the strip right of the
        // cutout, in both states — so it never jumps away under the
        // pointer when hovering morphs the teaser into the full view.
        .overlay(alignment: .topTrailing) {
            CopyMessageButton(copied: model.copied, diameter: avatarSize) {
                model.copy(message.text)
            }
            .offset(y: notchSize.height > 0 ? avatarOffsetY : 0)
        }
        // Clicking anywhere on the BLACK SHAPE copies — not just our content
        // rectangle. The hit area extends over the library's side insets,
        // the menu-bar strip and the bottom margin. The strip button still
        // wins on its own area (deepest hit target first).
        .contentShape(NotchHitArea(topExtra: notchSize.height))
        .onTapGesture {
            model.copy(message.text)
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.fullyExpanded)
    }

    /// Text below the notch; avatar lifted into the strip left of the cutout,
    /// flush with the text's leading edge so the line starts right under it.
    private var notchedTeaser: some View {
        TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
            .padding(.top, 2)
            .padding(.bottom, -6)
            .overlay(alignment: .topLeading) {
                CompactAvatarView(name: message.sender)
                    .offset(y: avatarOffsetY)
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

    /// Vertically centers the avatar in the menu-bar-height strip above.
    private var avatarOffsetY: CGFloat {
        -(notchSize.height + avatarSize) / 2
    }
}

/// The full black notch shape as a tap target: our content rect plus the
/// library's 15pt safe-area + 15pt corner padding per side, the menu-bar
/// strip above and the 15pt bottom inset.
private struct NotchHitArea: Shape {
    var topExtra: CGFloat

    func path(in rect: CGRect) -> Path {
        Path(CGRect(
            x: rect.minX - 30,
            y: rect.minY - topExtra,
            width: rect.width + 60,
            height: rect.height + topExtra + 15
        ))
    }
}
