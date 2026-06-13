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
    /// Messages from the last minute (excluding the current one), shown
    /// above it in the expanded state. Pruned live by NotchPresenter.
    @Published var history: [HistoryEntry] = []
    /// Click on the history area lifts the one-line truncation.
    @Published var historyExpanded = false
    /// Marker views registered by the container so NotchPresenter's click
    /// monitor can match clicks against their frames. NSHostingView's
    /// hitTest doesn't surface embedded NSViews, so frames it is.
    /// Teaser and expanded message get separate slots: during the morph
    /// both exist briefly, and sharing one slot lets the dying teaser
    /// view null out the expanded registration.
    weak var historyMarker: NSView?
    weak var replyMarker: NSView?
    weak var teaserMarker: NSView?

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
                        // Reply opens only from a click on the current
                        // message itself, not anywhere on the shape.
                        .background(AreaMarker { [weak model] in model?.replyMarker = $0 })
                        // Expanded, the copy button travels down to sit on
                        // the message it copies.
                        .overlay(alignment: .topTrailing) {
                            CopyMessageButton(copied: model.copied, diameter: avatarSize) {
                                model.copy(message.text)
                            }
                            .padding(.top, 2)
                            .padding(.trailing, 4)
                        }
                    if model.replySent {
                        sentConfirmation
                    } else if model.replying {
                        replyField
                    }
                    if !model.history.isEmpty {
                        historyRows
                    }
                }
                .frame(width: tickerWindow, alignment: .leading)
            } else if notchSize.height > 0 {
                notchedTeaser
            } else {
                fallbackTeaser
            }
        }
        // Never narrower than the expanded state: otherwise short
        // content can shrink the shape until it hides behind the
        // hardware notch.
        .frame(minWidth: tickerWindow, alignment: .leading)
        // In the teaser the copy button sits in the strip right of the
        // cutout; expanded it moves onto the message itself (see above).
        .overlay(alignment: .topTrailing) {
            if !model.fullyExpanded {
                CopyMessageButton(copied: model.copied, diameter: avatarSize) {
                    model.copy(message.text)
                }
                .offset(y: notchSize.height > 0 ? avatarOffsetY : 0)
            }
        }
        // Click-anywhere-to-reply is handled by an AppKit event monitor in
        // NotchPresenter — a SwiftUI tap gesture here would lose the first
        // click to window activation.
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.fullyExpanded)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.replying)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.replySent)
        // The notch is always black — pin the content to dark so the
        // system light mode can't restyle field, caret and chip.
        .colorScheme(.dark)
        // Message content must not leak into Teams/Zoom screen shares.
        // Must stay on the root, outside any conditional branch — see
        // CaptureExclusion for the invariant. Corollary: no .help()
        // anywhere in notch content, because AppKit draws tooltips in
        // their own window, which cannot inherit the exclusion and would
        // surface in a share while the notch itself is invisible.
        .excludedFromScreenCapture()
    }

    /// What else arrived in the last minute, dimmed and compact below the
    /// current message — newest first, so fresh live-pushed rows appear
    /// right under the main view. Rows vanish live once they expire
    /// (pruned by NotchPresenter).
    private var historyRows: some View {
        VStack(alignment: .leading, spacing: 3) {
            Rectangle()
                .fill(.white.opacity(0.15))
                .frame(height: 1)
                .padding(.bottom, 3)
            ForEach(model.history.reversed()) { entry in
                if model.historyExpanded {
                    // Expanded: full text on its own line below the name.
                    VStack(alignment: .leading, spacing: 1) {
                        historyHeader(for: entry)
                        Text(entry.text)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.55))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.bottom, 2)
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        historyHeader(for: entry)
                        Text(entry.text)
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.55))
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 6)
        .contentShape(Rectangle())
        // The click itself is handled by NotchPresenter's AppKit monitor,
        // which matches click coordinates against this marker's frame to
        // tell "expand history" apart from "start a reply".
        .background(AreaMarker { [weak model] in model?.historyMarker = $0 })
        .animation(.spring(duration: 0.3), value: model.history)
        .animation(.spring(duration: 0.3), value: model.historyExpanded)
    }

    /// Dot, sender and channel icon of one history row.
    private func historyHeader(for entry: HistoryEntry) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(entry.groupColor)
                .frame(width: 5, height: 5)
            Text(entry.sender)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4))
            Image(systemName: entry.isDirect ? "lock.fill" : "globe")
                .font(.system(size: 8))
                .foregroundStyle(.white.opacity(0.3))
        }
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

            TextField(
                "",
                text: $draft,
                // Explicit prompt color: the system placeholder gray is tuned
                // for light backgrounds and vanishes on the black notch.
                prompt: Text(
                    model.replyPrivately
                        ? "Private to \(message.sender)…"
                        : "Reply to all…"
                )
                // 0.45 white washed out on the always-black notch when the
                // system is in light mode — keep it readable in both.
                .foregroundStyle(.white.opacity(0.7))
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
            // replyPrivately still holds the channel the reply went out on.
            // The circle name only matters when there is more than one.
            Text(
                model.replyPrivately
                    ? "Sent to \(message.sender)"
                    : message.inMultipleGroups
                        ? "Sent to all in \(message.group)"
                        : "Sent to all"
            )
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
            // In the teaser the message IS the whole content — clicking
            // it starts the reply (and expands).
            .background(AreaMarker { [weak model] in model?.teaserMarker = $0 })
    }

    /// Macs without a notch: keep the avatar in-row, nothing to tuck beside.
    private var fallbackTeaser: some View {
        HStack(spacing: 10) {
            CompactAvatarView(name: message.sender, avatarData: message.avatarData)
            TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
        }
        .padding(.vertical, 4)
        .background(AreaMarker { [weak model] in model?.teaserMarker = $0 })
    }

    /// Vertically centers the avatar in the menu-bar-height strip above.
    private var avatarOffsetY: CGFloat {
        -(notchSize.height + avatarSize) / 2
    }
}

/// Invisible real NSView laid out behind an area of the notch. It only
/// exists so its frame is known to AppKit: NotchPresenter's click monitor
/// converts each click into the marker's coordinate space to decide what
/// was clicked (NSHostingView's own hitTest never returns embedded views).
private struct AreaMarker: NSViewRepresentable {
    let register: (NSView) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        register(view)
        return view
    }

    // No re-registration on update: each message gets a fresh hosting
    // view, and re-registering during transition animations would let a
    // disappearing branch clobber the registration of the live one.
    func updateNSView(_ nsView: NSView, context: Context) {}
}
