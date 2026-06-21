import AppKit
import MunkelKit
import SwiftUI

/// Drives the in-place morph between the one-line teaser, the full message
/// view and the inline reply field inside a single expanded notch, plus the
/// shared copied-feedback state.
/// Whether the notch is showing the message (teaser/expanded) or has morphed
/// down to the small unread anchor dot. Same panel, same instance — only the
/// mode flips, so the shape animates between the two sizes seamlessly.
enum NotchDisplayMode { case message, indicator }

@MainActor
final class MessageDisplayModel: ObservableObject {
    @Published var mode: NotchDisplayMode = .message
    /// The message this notch is presenting. Model-driven so a new message can
    /// morph the SAME panel (update + animate) instead of tearing it down.
    @Published var message: IncomingMessage
    /// Identity of the current message (its history-entry id). Changing it gives
    /// the message subtree a new identity so SwiftUI slides the new message in
    /// and the old one out, instead of silently swapping the content in place.
    @Published var messageToken = UUID()
    /// Hardware notch cutout size for the panel's screen; .zero on no-notch Macs.
    @Published var notchSize: CGSize = .zero
    /// Per-message callbacks, owned here so the persistent container always
    /// reaches the current message's handlers after a morph (set by NotchPresenter).
    var onReply: (_ text: String, _ images: [Data], _ privately: Bool) -> Void = { _, _, _ in }
    var onCancelReply: () -> Void = {}
    var onPickFile: () -> Void = {}
    var onTeaserFinished: () -> Void = {}
    /// Anchor-dot countdown ring: 1 when the newest message just arrived, 0 when
    /// it is about to age out (and the whole history vanishes). Driven once a
    /// second by NotchPresenter's prune loop; only visible in `.indicator` mode.
    @Published var anchorProgress: Double = 1
    @Published var fullyExpanded = false
    @Published var copied = false
    /// Decrypted full-resolution bytes per album image (keyed by r2Key),
    /// fetched from R2 on demand by the grid cells. The inline thumbnail
    /// stands in until then.
    @Published var fullImages: [String: Data] = [:]
    /// Images whose full fetch failed (expired/offline) — show a warning glyph.
    @Published var failedImages: Set<String> = []
    /// `id` (r2Key) of the album image currently shown in the large hover
    /// "Quick Look" preview, or nil when none. Set by an `AlbumCell` on hover
    /// (debounced) and force-cleared on every teardown path by NotchPresenter,
    /// since `.onHover(false)` doesn't reliably fire when the notch is torn down.
    /// Deliberately kept OUT of MessageNotchContainer's `.animation(value:)`
    /// lists so toggling it never re-runs the container's expand/history springs.
    @Published var previewImageID: String?
    /// The pending hover-debounce, owned here (not per-cell) so every teardown
    /// path can cancel it centrally — a per-cell `@State` Task would outlive its
    /// cell and could resurrect a just-cleared preview.
    private var previewDebounce: Task<Void, Never>?
    /// Per-image full-resolution loaders, set once by NotchPresenter. Not
    /// @Published: read by cells, it never needs to drive a refresh itself.
    var imageLoaders: [String: @Sendable () async -> Data?] = [:]
    /// Click on the message opened the reply field (set by NotchPresenter).
    @Published var replying = false
    /// The reply went out — show the confirmation, then auto-hide.
    @Published var replySent = false
    /// Reply channel: defaults to how the message arrived (private vs
    /// broadcast), toggled per message via the chip in the reply field.
    @Published var replyPrivately = false
    /// Images staged for the inline reply (an album): pasted with ⌘V or
    /// uploaded via the paperclip. When non-empty, Return sends the pictures
    /// and the typed text rides along as the shared caption. Lives on the
    /// model (not view-local @State) so the in-view ⌘V monitor AND the
    /// presenter's send/cancel reset can both reach it; mirrors
    /// CommandPaletteState.attachedImages.
    @Published var attachedImages: [Data] = []
    /// Messages from the last minute (excluding the current one), shown
    /// above it in the expanded state. Pruned live by NotchPresenter.
    @Published var history: [HistoryEntry] = []
    /// Click on the history area lifts the one-line truncation.
    @Published var historyExpanded = false
    /// Which history row just had its text copied — drives the per-row
    /// checkmark, independent of `copied` (the current message's button).
    @Published var copiedHistoryID: UUID?
    /// Which album image just had its picture copied — drives the per-image
    /// checkmark, independent of `copied` (the current message's button). The
    /// id is the image's r2Key (IncomingImage.id).
    @Published var copiedImageID: String?
    /// Which history row the pointer is over, or nil when it's over the current
    /// message (or a gap). Tells the hover-"C" shortcut which row to copy; nil
    /// means copy the current (newest) message.
    @Published var hoveredHistoryID: UUID?
    /// Text of the current (newest) message, so the hover-"C" shortcut can copy
    /// it when the pointer isn't over a history row.
    var currentText = ""
    /// `id` (r2Key) of the album image the pointer is over, set immediately on
    /// hover (no debounce, unlike the visual `previewImageID`) and cleared on the
    /// same lifecycle paths (endPreview / clearPreview). Lets the hover-"C"
    /// shortcut copy the hovered picture instead of the message text. Not
    /// @Published: read only at key-press time, it never drives a refresh.
    var hoveredImageID: String?
    /// Hover-revealed per-row copy hit targets. The glyph itself is a plain
    /// visual (CopyGlyph); the AppKit click monitor in NotchPresenter matches
    /// clicks against these frames — just like historyMarker/replyMarker —
    /// so the right row copies without a SwiftUI Button stealing the click.
    /// A row registers its target only while hovered, so a non-hovered row's
    /// trailing area still falls through to the expand toggle.
    var historyCopyTargets: [HistoryCopyTarget] = []
    /// Hover-revealed per-image copy hit targets, mirroring historyCopyTargets:
    /// the glyph is a plain visual (CopyGlyph) and the AppKit click monitor in
    /// NotchPresenter matches clicks against these frames — checked FIRST, before
    /// the reply/teaser markers, so copying a picture never also opens the reply
    /// field. A cell registers its target only while hovered. Not @Published:
    /// read by the monitor, it never needs to drive a refresh itself.
    var imageCopyTargets: [ImageCopyTarget] = []
    /// Marker views registered by the container so NotchPresenter's click
    /// monitor can match clicks against their frames. NSHostingView's
    /// hitTest doesn't surface embedded NSViews, so frames it is.
    /// Teaser and expanded message get separate slots: during the morph
    /// both exist briefly, and sharing one slot lets the dying teaser
    /// view null out the expanded registration.
    weak var historyMarker: NSView?
    weak var replyMarker: NSView?
    weak var teaserMarker: NSView?

    init(message: IncomingMessage) {
        self.message = message
    }

    /// Clear per-message transient state when the SAME model is reused for a new
    /// message (the morph path). Animated fields (mode / fullyExpanded / the
    /// panel's bottom inset) are flipped by NotchPresenter inside the morph
    /// animation, not here, so the shape grows smoothly instead of snapping. The
    /// click markers are left alone: they follow the message subtree's lifecycle
    /// (gone in dot mode, re-registered when it reappears).
    func resetTransient() {
        clearPreview()
        copied = false
        replying = false
        replySent = false
        fullImages = [:]
        failedImages = []
        attachedImages = []
        historyExpanded = false
        copiedHistoryID = nil
        copiedImageID = nil
        hoveredHistoryID = nil
        hoveredImageID = nil
        historyCopyTargets = []
        imageCopyTargets = []
    }

    func copy(_ text: String) {
        writePasteboard(text)
        flashCopied()
    }

    /// Hover requested the large preview for `id`. Debounced on first appearance
    /// (a fast album sweep shouldn't flash a card per cell); instant once a card
    /// is already up, so an adjacent-cell hand-off cross-fades via `.id(id)`
    /// instead of blanking for the debounce. The debounce is owned by the model
    /// so a leave/teardown can cancel it (see `clearPreview`).
    func requestPreview(_ id: String) {
        hoveredImageID = id
        previewDebounce?.cancel()
        if previewImageID != nil {
            withAnimation(.easeOut(duration: 0.18)) { previewImageID = id }
            return
        }
        previewDebounce = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(180))
            guard !Task.isCancelled, let self else { return }
            withAnimation(.easeOut(duration: 0.18)) { self.previewImageID = id }
        }
    }

    /// A cell reports hover-out: drop the pending request and, if this cell owns
    /// the visible preview, dismiss it (owner-check so an adjacent cell's enter,
    /// which can land before this leave, isn't undone).
    func endPreview(forCell id: String) {
        previewDebounce?.cancel()
        if hoveredImageID == id { hoveredImageID = nil }
        if previewImageID == id {
            withAnimation(.easeOut(duration: 0.18)) { previewImageID = nil }
        }
    }

    /// Hard clear for every teardown path (notch-leave, hide, reply): cancel any
    /// pending request and drop the preview. A cell's `.onHover(false)` doesn't
    /// reliably fire when the notch is torn down, so this must not depend on it.
    func clearPreview(animated: Bool = false) {
        previewDebounce?.cancel()
        hoveredImageID = nil
        guard previewImageID != nil else { return }
        if animated {
            withAnimation(.easeOut(duration: 0.18)) { previewImageID = nil }
        } else {
            previewImageID = nil
        }
    }

    private func flashCopied() {
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

    /// Copy one album image to the clipboard, flashing the checkmark on that
    /// image's glyph alone. The bytes are resolved at click time (full
    /// resolution if it has loaded, else the inline thumbnail).
    func copyImage(id: String, data: Data) {
        writeImagePasteboard(data)
        withAnimation(.spring(duration: 0.3)) { copiedImageID = id }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            // Only clear if this image is still the one showing the checkmark,
            // so a fresh copy on another image isn't cut short.
            if copiedImageID == id {
                withAnimation(.spring(duration: 0.3)) { copiedImageID = nil }
            }
        }
    }

    /// Register an image's copy hit target (called from the hover-revealed
    /// glyph). Replaces any prior target for the same image and drops dead ones,
    /// so the list never grows past the handful of cells hovered in one panel's
    /// life. The `resolve` closure is stored so full-vs-thumb is decided at the
    /// moment the click lands, not when the cell was first hovered.
    func registerImageCopy(id: String, resolve: @escaping () -> Data, view: NSView) {
        imageCopyTargets.removeAll { $0.view == nil || $0.id == id }
        imageCopyTargets.append(ImageCopyTarget(id: id, resolve: resolve, view: view))
    }

    /// The hover-"C" shortcut target, in priority order: the hovered album image
    /// (resolved through its registered copy target, exactly like a click on the
    /// per-image glyph), then the hovered history row, then — when the pointer
    /// isn't over either — the current (newest) message. Images sit on the
    /// current message, so without the image branch "C" over a picture fell
    /// through to the message text instead of copying the picture.
    func copyHovered() {
        if let id = hoveredImageID,
           let target = imageCopyTargets.first(where: { $0.id == id }) {
            copyImage(id: id, data: target.resolve())
        } else if let id = hoveredHistoryID, let entry = history.first(where: { $0.id == id }) {
            copyHistory(id: id, text: entry.text)
        } else if !currentText.isEmpty {
            copy(currentText)
        }
    }

    private func writePasteboard(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
    }

    private func writeImagePasteboard(_ data: Data) {
        guard let image = NSImage(data: data) else { return }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.writeObjects([image])
    }

    var canAttachMore: Bool { attachedImages.count < AppPayload.maxImagesPerMessage }

    /// Append a staged image (from the file picker), up to the per-message cap.
    func attach(_ data: Data) {
        if canAttachMore { attachedImages.append(data) }
    }

    /// Append the clipboard's image, if any. Returns whether one was added.
    @discardableResult
    func attachClipboardImage() -> Bool {
        guard canAttachMore, let data = ClipboardImage.read() else { return false }
        attachedImages.append(data)
        return true
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

/// A hover-revealed copy affordance on an album image. Holds the image's id
/// (its r2Key) and a `resolve` closure returning the bytes to copy — evaluated
/// at click time so the full resolution is preferred once it has loaded — plus
/// a weak reference to the marker NSView laid out under the glyph;
/// NotchPresenter's click monitor copies the image whose view contains the
/// click. Weak view: once the cell un-hovers the marker leaves the hierarchy
/// and this target goes stale (matched against nothing, pruned on next use).
final class ImageCopyTarget {
    let id: String
    let resolve: () -> Data
    weak var view: NSView?

    init(id: String, resolve: @escaping () -> Data, view: NSView) {
        self.id = id
        self.resolve = resolve
        self.view = view
    }
}

/// The notch content for one message. Teaser state: the avatar sits at
/// menu-bar height directly LEFT of the hardware notch (drawn into the black
/// strip via overlay offset), while the once-scrolling text line runs below
/// the notch. Hovering swells everything into the full message view.
struct MessageNotchContainer: View {
    @ObservedObject var model: MessageDisplayModel

    // Everything below reads from the model so a new message can morph this same
    // view in place (no rebuild). NotchPresenter sets them on display / morph.
    private var message: IncomingMessage { model.message }
    /// Hardware notch cutout size, measured from NSScreen; .zero on Macs
    /// without a notch (the panel then uses its floating style).
    private var notchSize: CGSize { model.notchSize }
    /// Called with the trimmed reply text, any staged images, and whether it
    /// goes privately to the sender (true) or to the whole circle; the
    /// images-vs-text routing happens in AppModel.
    private var onReply: (_ text: String, _ images: [Data], _ privately: Bool) -> Void { model.onReply }
    private var onCancelReply: () -> Void { model.onCancelReply }
    /// Opens the file picker (NSOpenPanel) to attach image files from disk —
    /// driven by NotchPresenter so it can suspend the outside-click dismiss
    /// while the modal is up. ⌘V paste is handled in-view (see pasteMonitor).
    private var onPickFile: () -> Void { model.onPickFile }
    private var onTeaserFinished: () -> Void { model.onTeaserFinished }

    @State private var draft = ""
    /// Local ⌘V monitor, armed only while the reply field is focused (MenuView
    /// pattern): an accessory app's field editor never routes `paste:` to
    /// SwiftUI, so image paste must be intercepted at the NSEvent level. Plain
    /// text paste falls through (we return the event) to the field editor.
    @State private var pasteMonitor: Any?
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
            if model.mode == .indicator {
                // Morphed down to the unread anchor ring (same panel, same
                // instance) — the shape animates from the message to this.
                UnreadIndicatorView(notchSize: notchSize, progress: model.anchorProgress)
            } else {
                messageContent
                    // A new message gets a new identity (messageToken), so it
                    // slides in from the top while the previous one fades out —
                    // a deliberate "new message" motion, not a silent swap. The
                    // removal stays a plain fade so collapsing to the dot keeps
                    // its smooth shrink.
                    .id(model.messageToken)
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .opacity
                    ))
            }
        }
        // Pin the width constant across every state (teaser, expanded, dot) so
        // the message<->dot morph is a pure vertical grow/shrink: with a mere
        // minWidth the content swap briefly re-measures down to the floor and
        // the shape flickers narrow before the new message sets its width.
        .frame(width: tickerWindow, alignment: .leading)
        // In the teaser the copy button sits in the strip right of the
        // cutout; expanded it moves onto the message itself (see above).
        .overlay(alignment: .topTrailing) {
            if model.mode == .message, !model.fullyExpanded, showsMessageCopyButton {
                CopyMessageButton(copied: model.copied, diameter: avatarSize) {
                    copyCurrent()
                }
                .offset(y: notchSize.height > 0 ? avatarOffsetY : 0)
            }
        }
        // Click-anywhere-to-reply is handled by an AppKit event monitor in
        // NotchPresenter — a SwiftUI tap gesture here would lose the first
        // click to window activation.
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: model.mode)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.fullyExpanded)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.replying)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.replySent)
        // Animate the container's own height when history expands/changes, so
        // it grows downward in step with the rows instead of the fixedSize
        // height jumping while the rows animate.
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.historyExpanded)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.history)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: model.attachedImages)
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

    /// The message states (teaser / expanded / no-notch fallback). Extracted so
    /// it can carry a per-message identity + slide transition, so a new message
    /// animates in instead of swapping its content in place.
    @ViewBuilder private var messageContent: some View {
        if model.fullyExpanded {
            // Same width as the teaser: hovering only grows downward.
            VStack(alignment: .leading, spacing: 6) {
                MessageNotchView(message: message, model: model)
                    // Reply opens only from a click on the current
                    // message itself, not anywhere on the shape.
                    .background(AreaMarker { [weak model] in model?.replyMarker = $0 })
                    // Expanded, the copy button travels down to sit on
                    // the message it copies. It copies the text/caption;
                    // pictures are copied per-image via the cell glyphs, so
                    // a captionless image message hides it (see
                    // showsMessageCopyButton).
                    .overlay(alignment: .topTrailing) {
                        if showsMessageCopyButton {
                            CopyMessageButton(copied: model.copied, diameter: avatarSize) {
                                copyCurrent()
                            }
                            .padding(.top, 2)
                            .padding(.trailing, 4)
                        }
                    }
                if model.replySent {
                    sentConfirmation
                } else if model.replying {
                    if !model.attachedImages.isEmpty {
                        attachmentStrip
                    }
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

            Button {
                onPickFile()
            } label: {
                Image(systemName: "paperclip")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.7))
                    .frame(width: 20, height: 20)
                    .background(.white.opacity(0.12), in: Circle())
            }
            .buttonStyle(.plain)
            .focusable(false)
            .disabled(!model.canAttachMore)

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
                    // Allow an image-only reply (mirrors CommandPaletteView.canSend).
                    guard !text.isEmpty || !model.attachedImages.isEmpty else { return }
                    onReply(text, model.attachedImages, model.replyPrivately)
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
                .onChange(of: replyFocused) { _, focused in updatePasteMonitor(focused) }
                .onDisappear { teardownPasteMonitor() }
        }
        .padding(.horizontal, 6)
        .padding(.bottom, 6)
    }

    /// Staged reply images as a row of thumbnails; tap one to remove it.
    /// Mirrors CommandPaletteView.attachmentStrip but WITHOUT .help() (AppKit
    /// tooltips draw in their own window that can't inherit the capture
    /// exclusion — see the invariant at the .excludedFromScreenCapture root).
    private var attachmentStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(model.attachedImages.enumerated()), id: \.offset) { index, data in
                    if let nsImage = NSImage(data: data) {
                        Button {
                            withAnimation(.spring(duration: 0.2)) { _ = model.attachedImages.remove(at: index) }
                            replyFocused = true
                        } label: {
                            Image(nsImage: nsImage)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 30, height: 30)
                                .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
                                .overlay(alignment: .topTrailing) {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 11))
                                        .foregroundStyle(.white, .black.opacity(0.5))
                                        .padding(1)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 6)
        }
        .padding(.bottom, 4)
    }

    /// Installs (on focus) / removes (on blur) a local ⌘V monitor that stages a
    /// clipboard image into model.attachedImages. Copied from
    /// MenuView.updatePasteMonitor; plain-text paste falls through to the field.
    private func updatePasteMonitor(_ focused: Bool) {
        // Gate the install on an actually-open reply: the field's 80ms focus
        // Task can fire after the reply was dismissed (onDisappear already tore
        // the monitor down). Without this guard that late focus write would
        // re-install a monitor nothing then removes — a leak that swallows ⌘V
        // globally. model.replying is false by then, so the install is skipped.
        if focused, model.replying, pasteMonitor == nil {
            pasteMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                var consume = false
                MainActor.assumeIsolated {
                    guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command,
                          event.charactersIgnoringModifiers?.lowercased() == "v",
                          model.canAttachMore,
                          model.attachClipboardImage()
                    else { return }
                    consume = true
                }
                return consume ? nil : event
            }
        } else if !focused {
            teardownPasteMonitor()
        }
    }

    private func teardownPasteMonitor() {
        if let pasteMonitor {
            NSEvent.removeMonitor(pasteMonitor)
        }
        pasteMonitor = nil
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
        HStack(spacing: 6) {
            Image(systemName: message.isDirect ? "lock.fill" : "globe")
                .font(.system(size: 9))
                .foregroundStyle(.white.opacity(0.55))
            teaserContent
        }
        .padding(.top, 2)
        .padding(.bottom, -6)
        .overlay(alignment: .topLeading) {
            CompactAvatarView(name: message.sender, avatarData: message.avatarData)
                .offset(y: avatarOffsetY)
        }
        .background(AreaMarker { [weak model] in model?.teaserMarker = $0 })
    }

    /// Macs without a notch: keep the avatar in-row, nothing to tuck beside.
    private var fallbackTeaser: some View {
        HStack(spacing: 10) {
            CompactAvatarView(name: message.sender, avatarData: message.avatarData)
            HStack(spacing: 6) {
                Image(systemName: message.isDirect ? "lock.fill" : "globe")
                    .font(.system(size: 9))
                    .foregroundStyle(.white.opacity(0.55))
                teaserContent
            }
        }
        .padding(.vertical, 4)
        .background(AreaMarker { [weak model] in model?.teaserMarker = $0 })
    }

    /// One-line teaser body: the scrolling text, or a thumbnail strip for an
    /// image message (which has no text to scroll).
    @ViewBuilder private var teaserContent: some View {
        if message.isImage {
            imageTeaserLine
        } else {
            TickerText(text: message.text, windowWidth: tickerWindow, onFinished: onTeaserFinished)
        }
    }

    private var imageTeaserLine: some View {
        HStack(spacing: 6) {
            ForEach(message.images.prefix(3)) { img in
                NotchThumb(thumb: img.thumb, side: 26)
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
            }
            if message.images.count > 3 {
                Text("+\(message.images.count - 3)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.7))
            }
            Text(teaserLabel)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        // No ticker to report completion — linger briefly, then hand off to
        // the same auto-hide timing the text teaser uses.
        .task {
            try? await Task.sleep(for: .seconds(2.5))
            onTeaserFinished()
        }
    }

    /// Teaser caption: the album's caption if any, else an image count.
    private var teaserLabel: String {
        if !message.text.isEmpty { return message.text }
        return message.images.count == 1 ? "Image" : "\(message.images.count) images"
    }

    private func copyCurrent() {
        model.copy(message.text)
    }

    /// Whether the per-message copy button is shown at all. It copies
    /// text/caption, so an image message with no caption — which has no text —
    /// drops it and relies solely on the per-image copy glyphs.
    private var showsMessageCopyButton: Bool {
        !message.isImage || !message.text.isEmpty
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
                        if entry.isImage {
                            // The album that the collapsed 📷 row stands in for —
                            // thumbnails upgrading to full resolution like the
                            // current message, with the real caption beneath.
                            HistoryAlbumGrid(model: model, entry: entry)
                                .padding(.top, 2)
                            if !entry.caption.isEmpty {
                                caption
                            }
                        } else {
                            text.fixedSize(horizontal: false, vertical: true)
                        }
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

    /// The album's real caption, shown under the thumbnails in the expanded
    /// view (the collapsed row uses the 📷 label in `text` instead).
    private var caption: some View {
        Text(entry.caption)
            .font(.system(size: 11))
            .foregroundStyle(.white.opacity(0.55))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 2)
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

/// The album of a past image message, laid out for the expanded history: a lone
/// picture fits its aspect, an album packs up to four square thumbnails per row —
/// a compact echo of the current message's grid (MessageNotchView.imageContent),
/// scaled down to suit the secondary, dimmed history area.
private struct HistoryAlbumGrid: View {
    @ObservedObject var model: MessageDisplayModel
    let entry: HistoryEntry

    /// Narrower than the current message's grid: the history block is inset and
    /// leaves room for the trailing copy glyph.
    private let maxWidth: CGFloat = 196
    private let spacing: CGFloat = 4

    var body: some View {
        let images = entry.images
        if images.count == 1, let only = images.first {
            let size = fittedSize(width: only.width, height: only.height)
            HistoryAlbumCell(model: model, image: only, loadFull: entry.loadFull,
                             displaySize: size, cornerRadius: 7, fill: false)
        } else {
            let columnCount = min(4, images.count)
            let side = (maxWidth - CGFloat(columnCount - 1) * spacing) / CGFloat(columnCount)
            // Non-lazy rows (not LazyVGrid): an album is ≤8 cells so laziness
            // buys nothing, and LazyVGrid's per-cell `.onHover` only fires
            // reliably for the first cell — which would break the hover preview on
            // every other history picture (same reason the current message's grid
            // is non-lazy, see MessageNotchView.imageContent).
            let rows = stride(from: 0, to: images.count, by: columnCount).map { start in
                Array(images[start..<min(start + columnCount, images.count)])
            }
            VStack(alignment: .leading, spacing: spacing) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: spacing) {
                        ForEach(row) { img in
                            HistoryAlbumCell(model: model, image: img, loadFull: entry.loadFull,
                                             displaySize: CGSize(width: side, height: side),
                                             cornerRadius: 6, fill: true)
                        }
                    }
                }
            }
            .frame(width: maxWidth, alignment: .leading)
        }
    }

    /// A lone image's aspect scaled to fit the history box (never upscaled past it).
    private func fittedSize(width: Int, height: Int) -> CGSize {
        let w = CGFloat(width)
        let h = CGFloat(height)
        let maxHeight: CGFloat = 130
        guard w > 0, h > 0 else { return CGSize(width: maxWidth, height: maxWidth * 0.6) }
        let scale = min(maxWidth / w, maxHeight / h)
        return CGSize(width: max(1, w * scale), height: max(1, h * scale))
    }
}

/// One history image cell: paints its inline thumbnail at once, then upgrades to
/// full resolution via the entry's loader, caching the bytes on the shared model
/// (keyed by the unique r2Key) so a collapse→expand toggle re-decodes from cache
/// instead of re-fetching from R2. A self-contained sibling of `AlbumCell` with
/// the same affordances: a hover pops the large free-floating Quick-Look preview
/// (resolved from the model's history, see ImagePreviewOverlay) AND reveals a
/// per-image copy glyph — click it, or press "C" while hovering, to copy the
/// picture, through the exact same hit-target path as the current message.
///
/// Cells mount — and so fetch — only when the history is actually expanded, and
/// only the FIRST expand fetches (later ones hit the cache). The resulting burst
/// across the backlog is hard-bounded by the ≤60 s history window, and R2 GETs
/// stay valid within that window (the blob TTL mirrors it, and a GET isn't
/// delete-on-fetch), so concurrent re-fetches are safe.
private struct HistoryAlbumCell: View {
    @ObservedObject var model: MessageDisplayModel
    let image: IncomingImage
    let loadFull: (@Sendable (String) async -> Data?)?
    /// Final on-screen size of the picture. Sized + clipped HERE (not by the
    /// caller) so the copy glyph can sit OUTSIDE the rounded clip — mirrors AlbumCell.
    let displaySize: CGSize
    let cornerRadius: CGFloat
    /// Grid cells fill+crop to a square; a lone image fits its aspect.
    let fill: Bool

    @State private var decoded: CGImage?
    @State private var hovering = false

    private var isLoaded: Bool { model.fullImages[image.id] != nil }
    private var didFail: Bool { model.failedImages.contains(image.id) }

    /// Smaller than the current message's 20pt glyph — history cells are compact.
    private let glyphDiameter: CGFloat = 18

    /// Animated bytes to play once loaded; nil keeps the still thumbnail.
    private var animatedFull: Data? {
        guard image.isAnimated, let full = model.fullImages[image.id] else { return nil }
        return full
    }

    var body: some View {
        ZStack {
            if let animatedFull {
                AnimatedImageView(data: animatedFull, contentMode: fill ? .fill : .fit)
            } else if let decoded {
                Image(decorative: decoded, scale: 1)
                    .resizable()
                    .interpolation(.medium)
                    .aspectRatio(contentMode: fill ? .fill : .fit)
            } else {
                Rectangle().fill(.white.opacity(0.08))
            }
            if !isLoaded, !didFail {
                ProgressView().controlSize(.small).tint(.white.opacity(0.7))
            } else if didFail {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
            }
        }
        // Size + clip HERE (before the glyph overlay) so a `.fill` cell's overflow
        // can't spill onto neighbours, and the glyph — added next — sits outside
        // the rounded clip. Mirrors AlbumCell.
        .frame(width: displaySize.width, height: displaySize.height)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        .overlay(alignment: .topTrailing) { copyGlyph }
        // Hover pops the large preview (resolved from history) and, via `hovering`,
        // the copy glyph. contentShape so a `.fill` cell's overflow can't steal the
        // hover from a neighbour (mirrors AlbumCell).
        .contentShape(Rectangle())
        .onHover { inside in
            hovering = inside
            if inside {
                model.requestPreview(image.id)
            } else {
                model.endPreview(forCell: image.id)
            }
        }
        .task { await load() }
    }

    /// Per-image copy, mirroring AlbumCell: hidden until hover (or while its
    /// checkmark lingers). The hit target exists only while hovered — NotchPresenter
    /// copies the image whose target a click lands in, and the bare-"C" hotkey
    /// copies the hovered one via the same target; the bytes resolve full-vs-thumb
    /// at copy time.
    private var copyGlyph: some View {
        let isCopied = model.copiedImageID == image.id
        let show = hovering || isCopied
        return CopyGlyph(copied: isCopied, diameter: glyphDiameter)
            .opacity(show ? 1 : 0)
            .background {
                if hovering {
                    ImageCopyHitTarget(
                        id: image.id,
                        resolve: { [weak model] in model?.fullImages[image.id] ?? image.thumb }
                    ) { [weak model] id, resolve, view in
                        model?.registerImageCopy(id: id, resolve: resolve, view: view)
                    }
                }
            }
            .padding(3)
            .animation(.easeInOut(duration: 0.12), value: show)
    }

    private func load() async {
        if decoded == nil {
            let thumb = image.thumb
            decoded = await Task.detached { ImageCodec.decode(thumb, maxPixels: 300) }.value
        }
        if let full = model.fullImages[image.id] {
            if image.isAnimated { return }
            decoded = await Task.detached { ImageCodec.decode(full, maxPixels: 900) }.value
            return
        }
        guard !didFail, let loadFull else { return }
        if let data = await loadFull(image.id) {
            model.fullImages[image.id] = data
            if image.isAnimated { return }
            decoded = await Task.detached { ImageCodec.decode(data, maxPixels: 900) }.value
        } else {
            model.failedImages.insert(image.id)
        }
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
