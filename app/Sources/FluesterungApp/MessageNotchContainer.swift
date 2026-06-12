import AppKit
import SwiftUI

/// Drives the in-place morph between the one-line teaser, the full message
/// view and the inline reply field inside a single expanded notch, plus the
/// shared copied-feedback state.
@MainActor
final class MessageDisplayModel: ObservableObject {
    @Published var fullyExpanded = false
    @Published var copied = false
    /// Click on the message opened the reply field (set by NotchPresenter).
    @Published var replying = false
    /// The reply went out — show the confirmation, then auto-hide.
    @Published var replySent = false
    /// Reply channel: defaults to how the message arrived (private vs
    /// broadcast), toggled per message via the chip in the reply field.
    @Published var replyPrivately = false

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
    /// Called with the trimmed reply text and whether it goes privately to
    /// the sender (true) or to the whole circle; routing happens in AppModel.
    var onReply: (String, Bool) -> Void
    var onCancelReply: () -> Void
    var onTeaserFinished: () -> Void

    @State private var draft = ""
    @FocusState private var replyFocused: Bool

    private let avatarSize: CGFloat = 20
    /// Wide enough that the avatar (sitting at the content's leading edge,
    /// 30pt from the shape's left side) stays clear of the camera cutout:
    /// side zone = (tickerWindow + 60 − notchWidth) / 2 ≥ 55pt for ≤200pt notches.
    private let tickerWindow: CGFloat = 250

    var body: some View {
        Group {
            if model.fullyExpanded {
                // Same width as the teaser: hovering only grows downward.
                VStack(alignment: .leading, spacing: 6) {
                    MessageNotchView(message: message)
                    if model.replySent {
                        sentConfirmation
                    } else if model.replying {
                        replyField
                    }
                }
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
        // Click-anywhere-to-reply is handled by an AppKit event monitor in
        // NotchPresenter — a SwiftUI tap gesture here would lose the first
        // click to window activation.
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.fullyExpanded)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.replying)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.replySent)
    }

    /// Inline reply. Return sends, Escape dismisses; focus lands here as
    /// soon as the field appears (the panel was made key by the click that
    /// opened it). The chip on the left shows the reply channel — pre-set
    /// to how the message arrived — and toggles it per click.
    private var replyField: some View {
        HStack(spacing: 6) {
            Button {
                model.replyPrivately.toggle()
            } label: {
                Image(systemName: model.replyPrivately ? "lock.fill" : "globe")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 20, height: 20)
                    .background(.white.opacity(0.12), in: Circle())
            }
            .buttonStyle(.plain)
            .help(
                model.replyPrivately
                    ? "Antwortet privat an \(message.sender) — klicken für alle"
                    : "Antwortet an alle — klicken für privat"
            )

            TextField(
                "",
                text: $draft,
                // Explicit prompt color: the system placeholder gray is tuned
                // for light backgrounds and vanishes on the black notch.
                prompt: Text(
                    model.replyPrivately
                        ? "Privat an \(message.sender)…"
                        : "Antwort an alle…"
                )
                .foregroundStyle(.white.opacity(0.45))
            )
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .foregroundStyle(.white)
                .tint(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 7))
                .focused($replyFocused)
                .onSubmit {
                    let text = draft.trimmingCharacters(in: .whitespaces)
                    guard !text.isEmpty else { return }
                    onReply(text, model.replyPrivately)
                }
                .onExitCommand(perform: onCancelReply)
                .onAppear {
                    // One tick later: at onAppear the panel is still mid
                    // makeKey()/expand-animation and the focus write is lost.
                    Task {
                        try? await Task.sleep(for: .milliseconds(80))
                        replyFocused = true
                    }
                }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 6)
    }

    private var sentConfirmation: some View {
        HStack(spacing: 5) {
            Image(systemName: "checkmark.circle.fill")
            Text("Gesendet")
        }
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(.white.opacity(0.7))
        .padding(.horizontal, 8)
        .padding(.bottom, 6)
    }

    /// Text below the notch; avatar lifted into the strip left of the cutout,
    /// flush with the text's leading edge so the line starts right under it.
    private var notchedTeaser: some View {
        TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
            .padding(.top, 2)
            .padding(.bottom, -6)
            .overlay(alignment: .topLeading) {
                CompactAvatarView(name: message.sender, avatarData: message.avatarData)
                    .offset(y: avatarOffsetY)
            }
    }

    /// Macs without a notch: keep the avatar in-row, nothing to tuck beside.
    private var fallbackTeaser: some View {
        HStack(spacing: 10) {
            CompactAvatarView(name: message.sender, avatarData: message.avatarData)
            TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
        }
        .padding(.vertical, 4)
    }

    /// Vertically centers the avatar in the menu-bar-height strip above.
    private var avatarOffsetY: CGFloat {
        -(notchSize.height + avatarSize) / 2
    }
}
