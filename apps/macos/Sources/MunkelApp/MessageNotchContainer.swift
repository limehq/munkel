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
    /// Which history row just had its text copied — drives the per-row
    /// checkmark, independent of `copied` (the current message's button).
    @Published var copiedHistoryID: UUID?
    /// Which history row the pointer is over (nil = none). Lets NotchPresenter
    /// enable the bare-"C" copy hotkey only while a row is hovered, and tells it
    /// which row to copy when "C" is pressed.
    @Published var hoveredHistoryID: UUID?
    /// Hover-revealed per-row copy hit targets. The glyph itself is a plain
    /// visual (CopyGlyph); the AppKit click monitor in NotchPresenter matches
    /// clicks against these frames — just like historyMarker/replyMarker —
    /// so the right row copies without a SwiftUI Button stealing the click.
    /// A row registers its target only while hovered, so a non-hovered row's
    /// trailing area still falls through to the expand toggle.
    var historyCopyTargets: [HistoryCopyTarget] = []
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
        writePasteboard(text)
        withAnimation(.spring(duration: 0.3)) { copied = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.spring(duration: 0.3)) { copied = false }
        }
    }

    /// Copy one history row, flashing the checkmark on that row alone.
    func copyHistory(id: UUID, text: String) {
        writePasteboard(text)
        withAnimation(.spring(duration: 0.3)) { copiedHistoryID = id }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            // Only clear if this row is still the one showing the checkmark,
            // so a fresh copy on another row isn't cut short.
            if copiedHistoryID == id {
                withAnimation(.spring(duration: 0.3)) { copiedHistoryID = nil }
            }
        }
    }

    /// Register a row's copy hit target (called from the hover-revealed glyph).
    /// Replaces any prior target for the same row and drops dead ones, so the
    /// list never grows past the handful of rows hovered in one panel's life.
    func registerHistoryCopy(id: UUID, text: String, view: NSView) {
        historyCopyTargets.removeAll { $0.view == nil || $0.id == id }
        historyCopyTargets.append(HistoryCopyTarget(id: id, text: text, view: view))
    }

    /// Copy whichever history row the pointer is over — the target of the
    /// hover-only "C" shortcut. No-op if nothing is hovered.
    func copyHoveredHistory() {
        guard let id = hoveredHistoryID,
              let entry = history.first(where: { $0.id == id }) else { return }
        copyHistory(id: id, text: entry.text)
    }

    private func writePasteboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }
}

/// A hover-revealed copy affordance on a history row. Holds the row's id and
/// text plus a weak reference to the marker NSView laid out under the glyph;
/// NotchPresenter's click monitor copies the row whose view contains the
/// click. Weak view: once the row un-hovers the marker leaves the hierarchy
/// and this target goes stale (matched against nothing, pruned on next use).
final class HistoryCopyTarget {
    let id: UUID
    let text: String
    weak var view: NSView?

    init(id: UUID, text: String, view: NSView) {
        self.id = id
        self.text = text
        self.view = view
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
    /// without a notch (the panel then uses its floating style).
    let notchSize: CGSize
    /// Called with the trimmed reply text and whether it goes privately to
    /// the sender (true) or to the whole circle; routing happens in AppModel.
    var onReply: (String, Bool) -> Void
    var onCancelReply: () -> Void
    var onTeaserFinished: () -> Void

    @State private var draft = ""
    /// Measured height of the expanded history, to bound its scroll region.
    @State private var historyHeight: CGFloat = 0
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
        // Animate the container's own height when history expands/changes, so
        // it grows downward in step with the rows instead of the fixedSize
        // height jumping while the rows animate.
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.historyExpanded)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.history)
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
        // Zero spacing so the rows' hover zones (each glyph-tall, taller than
        // the text — see HistoryRow) meet edge to edge: no dead gap between rows
        // where the copy glyph would flicker off, and the list stays compact.
        VStack(alignment: .leading, spacing: 0) {
            Rectangle()
                .fill(.white.opacity(0.15))
                .frame(height: 1)
                .padding(.bottom, 3)
            if model.historyExpanded {
                expandedHistory
            } else {
                ForEach(model.history.reversed()) { entry in
                    HistoryRow(model: model, entry: entry, expanded: false)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 6)
        .contentShape(Rectangle())
        // The click itself is handled by NotchPresenter's AppKit monitor,
        // which matches click coordinates against this marker's frame to
        // tell "expand history" apart from "start a reply" — and, when a row
        // is hovered, against that row's copy target (checked first) to copy
        // it instead of toggling.
        .background(AreaMarker { [weak model] in model?.historyMarker = $0 })
        .animation(.spring(duration: 0.3), value: model.history)
        .animation(.spring(duration: 0.3), value: model.historyExpanded)
    }

    /// Expanded history: full text per row, bounded to ~⅓ of the screen and
    /// scrollable beyond that so a long backlog can't run down the display.
    /// Explicit (measured) height — a bare ScrollView collapses inside the
    /// notch's fixedSize layout.
    private var expandedHistory: some View {
        let cap = (NSScreen.main?.frame.height ?? 900) / 3
        return ScrollView {
            // Zero spacing for the same reason as the collapsed list: contiguous,
            // glyph-tall hover zones with no dead gap (each expanded row adds its
            // own in-zone bottom inset for readability — see HistoryRow).
            VStack(alignment: .leading, spacing: 0) {
                ForEach(model.history.reversed()) { entry in
                    HistoryRow(model: model, entry: entry, expanded: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                GeometryReader { geo in
                    Color.clear.preference(key: HistoryHeightKey.self, value: geo.size.height)
                }
            )
        }
        .frame(height: historyHeight == 0 ? nil : min(historyHeight, cap))
        .onPreferenceChange(HistoryHeightKey.self) { historyHeight = $0 }
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
                .onChange(of: draft) { _, new in
                    if new.count > MessageLimits.maxCharacters {
                        draft = String(new.prefix(MessageLimits.maxCharacters))
                    }
                }
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

/// One history row: sender header plus the message text (one line collapsed,
/// full when expanded), with a copy glyph that fades in on hover. The glyph is
/// purely visual — clicking it is caught by NotchPresenter's event monitor,
/// which matches the hover-registered hit target laid out beneath the glyph.
private struct HistoryRow: View {
    @ObservedObject var model: MessageDisplayModel
    let entry: HistoryEntry
    /// Expanded shows the full (wrapping) text; collapsed clamps to one line.
    let expanded: Bool

    @State private var hovering = false

    /// Matches the current message's own copy button. The slot is always
    /// reserved (opacity, not layout, hides it), so this also sets the
    /// collapsed one-line row height — a deliberate trade for a comfortably
    /// sized, easy-to-hit target over maximum density.
    private let glyphDiameter: CGFloat = 20

    var body: some View {
        Group {
            if expanded {
                HStack(alignment: .top, spacing: 4) {
                    VStack(alignment: .leading, spacing: 1) {
                        header
                        text.fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    glyph
                }
                // A little air between full-text rows, kept inside the hover
                // zone so it adds no dead gap. Collapsed rows skip it to stay tight.
                .padding(.bottom, 4)
            } else {
                HStack(spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        header
                        text.lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    glyph
                }
            }
        }
        // No outer padding — the row is already glyph-tall (≥20pt), so its hover
        // zone sits a few points above and below the text. With zero spacing
        // between rows (see historyRows) the zones meet edge to edge, so the
        // glyph appears as soon as the pointer is in the history block — no need
        // to land exactly on the text — while collapsed rows stay compact.
        .contentShape(Rectangle())
        // Hover gates the glyph, its click target, AND the bare-"C" copy
        // shortcut (NotchPresenter watches hoveredHistoryID). An un-hovered
        // row's trailing area still toggles the history via the monitor.
        .onHover { inside in
            hovering = inside
            if inside {
                model.hoveredHistoryID = entry.id
            } else if model.hoveredHistoryID == entry.id {
                // Only clear if we're still the hovered row: moving to an
                // adjacent row, its enter can land before this leave.
                model.hoveredHistoryID = nil
            }
        }
    }

    /// Dot, sender and channel icon of the row.
    private var header: some View {
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

    private var text: some View {
        Text(entry.text)
            .font(.system(size: 11))
            .foregroundStyle(.white.opacity(0.55))
    }

    /// Copy affordance: hidden until hover (or while its checkmark lingers),
    /// always reserving its slot so the text doesn't reflow on reveal. The
    /// hit target only exists while hovered — NotchPresenter copies the row
    /// whose target the click lands in.
    private var glyph: some View {
        let isCopied = model.copiedHistoryID == entry.id
        let show = hovering || isCopied
        return CopyGlyph(copied: isCopied, diameter: glyphDiameter)
            .opacity(show ? 1 : 0)
            .background {
                if hovering {
                    HistoryCopyHitTarget(id: entry.id, text: entry.text) { [weak model] id, text, view in
                        model?.registerHistoryCopy(id: id, text: text, view: view)
                    }
                }
            }
            .animation(.easeInOut(duration: 0.12), value: show)
    }
}

/// Invisible NSView laid out under a history row's copy glyph. Like AreaMarker
/// but carries the row id and text, registered into the model so the click
/// monitor can copy the matching row (NSHostingView's hitTest can't surface it).
private struct HistoryCopyHitTarget: NSViewRepresentable {
    let id: UUID
    let text: String
    let register: (UUID, String, NSView) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        register(id, text, view)
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
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

private struct HistoryHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}
