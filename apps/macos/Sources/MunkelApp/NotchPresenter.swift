import AppKit
import Combine
import KeyboardShortcuts
import SwiftUI
import UniformTypeIdentifiers

/// Presents incoming messages below the notch: a slim one-line teaser
/// (avatar + text scrolling through once), expanding to the full message
/// with the copy button on hover. Clicking the message opens an inline
/// reply field addressed to the sender. The NotchPanel component hosts the
/// panel; this type owns when it shows and hides (the component collapses
/// the moment hide() is called, so all hide timing lives here).
@MainActor
final class NotchPresenter {
    private typealias MessageNotch = NotchPanel<MessageNotchContainer>
    private typealias IndicatorNotch = NotchPanel<UnreadIndicatorView>
    private typealias AuthCodeNotch = NotchPanel<AuthCodeNotchView>

    private var currentNotch: MessageNotch?
    private var currentModel: MessageDisplayModel?
    private var indicatorNotch: IndicatorNotch?
    private var authCodeNotch: AuthCodeNotch?
    /// Serializes auth-code show/hide so a hide fully tears its panel down
    /// before the next show builds one — a quick cancel→re-login would
    /// otherwise race the new code's panel against the old one's teardown.
    private var authCodeOp: Task<Void, Never>?
    private var hideTask: Task<Void, Never>?
    private var pruneTask: Task<Void, Never>?
    private var hoverObservation: AnyCancellable?
    private var hoverCopyObservation: AnyCancellable?
    /// Observes hover on the unread indicator to dismiss it.
    private var indicatorHoverObservation: AnyCancellable?
    private var onIndicatorHover: (() -> Void)?
    private var clickMonitor: Any?
    private var outsideClickMonitor: Any?
    /// While a modal file picker (NSOpenPanel) is up, its in-process clicks
    /// would be read as "clicked outside the notch" by the click monitors and
    /// collapse the open reply. Set during pickImageFile to suppress the
    /// dismiss, mirroring CommandPalettePresenter.suppressResignHide.
    private var suppressReplyDismiss = false
    private var userInteractedWithMessage = false

    /// RAM-only message history shown in the expanded notch: everything
    /// younger than this window, deleted afterwards (also live on screen).
    private let historyWindow: TimeInterval = 60
    private var history: [HistoryEntry] = []

    /// Displays run strictly one after another; a message that gets
    /// superseded while waiting is skipped (it lives on as a history row).
    private var pendingShow: Task<Void, Never>?
    private var showGeneration = 0
    private var currentEntryID: UUID?
    private var notchVisible = false

    private let afterTeaserDelay: Duration = .seconds(2)
    private let afterReadDelay: Duration = .seconds(1)

    init() {
        // The hover-copy shortcut is a bare "C". Attach the handler once, then
        // force it OFF: registering the handler is what arms the global Carbon
        // hotkey, so disabling AFTERWARDS guarantees the end state is dormant no
        // matter the library's internal ordering. display() turns it on ONLY
        // while a history row is hovered (and no reply is open), so it never
        // swallows a "C" typed anywhere else.
        KeyboardShortcuts.onKeyDown(for: .copyHoveredHistory) { [weak self] in
            self?.currentModel?.copyHovered()
        }
        KeyboardShortcuts.disable(.copyHoveredHistory)
    }

    /// Upper bound in case the teaser never reports completion — sized to
    /// the text so long messages aren't cut off mid-scroll. Rough estimate:
    /// ~7pt per character at the ticker's font, scrolling at 24pt/s through
    /// a 250pt window, plus generous start/finish buffers.
    private func safetyDuration(for text: String) -> Duration {
        let scrollSeconds = max(0, (Double(text.count) * 7 - 250) / 24)
        return .seconds(min(90, 10 + scrollSeconds))
    }

    func show(
        sender: String,
        avatarData: Data?,
        text: String = "",
        isDirect: Bool,
        group: String,
        groupColor: Color,
        inMultipleGroups: Bool,
        images: [IncomingImage] = [],
        silent: Bool = false,
        loadFull: (@Sendable (String) async -> Data?)? = nil,
        onReply: @escaping (_ text: String, _ images: [Data], _ privately: Bool) -> Void
    ) {
        let message = IncomingMessage(
            sender: sender,
            avatarData: avatarData,
            text: text,
            isDirect: isDirect,
            group: group,
            groupColor: groupColor,
            inMultipleGroups: inMultipleGroups,
            images: images
        )
        // History rows are text-only; an album shows its caption (or an image
        // count), prefixed with a 📷 so it reads as a picture.
        let historyText: String
        if images.isEmpty {
            historyText = text
        } else if !text.isEmpty {
            historyText = "📷 \(text)"
        } else {
            historyText = images.count == 1 ? "📷 Image" : "📷 \(images.count) images"
        }
        let entry = HistoryEntry(
            sender: sender,
            text: historyText,
            isDirect: isDirect,
            group: group,
            groupColor: groupColor,
            receivedAt: Date(),
            // Carry the album so the expanded history can show it later; the
            // collapsed row still reads as the 📷 label above. `text` is the
            // raw caption here (empty for a captionless album / plain message).
            images: images,
            caption: images.isEmpty ? "" : text,
            loadFull: loadFull
        )
        pruneHistory()
        history.append(entry)

        // A living expanded instance absorbs new messages directly into
        // its history rows — no teardown, no replay after un-hovering.
        if notchVisible, let model = currentModel, model.fullyExpanded, !model.replySent,
           let displayedID = currentEntryID {
            withAnimation(.spring(duration: 0.3)) {
                model.history = visibleHistory(excluding: displayedID)
            }
            return
        }

        if silent {
            if !notchVisible {
                onIndicatorHover = { [weak self] in
                    self?.scheduleDisplay(message, entryID: entry.id, loadFull: loadFull, onReply: onReply)
                }
                showIndicator()
            }
            return
        }

        scheduleDisplay(message, entryID: entry.id, loadFull: loadFull, onReply: onReply)
    }

    private func scheduleDisplay(
        _ message: IncomingMessage,
        entryID: UUID,
        loadFull: (@Sendable (String) async -> Data?)?,
        onReply: @escaping (_ text: String, _ images: [Data], _ privately: Bool) -> Void
    ) {
        showGeneration += 1
        let generation = showGeneration
        let previous = pendingShow
        pendingShow = Task { [weak self] in
            await previous?.value
            guard let self, generation == self.showGeneration else { return }
            await self.display(message, entryID: entryID, generation: generation, loadFull: loadFull, onReply: onReply)
        }
    }

    private func display(
        _ message: IncomingMessage,
        entryID: UUID,
        generation: Int,
        loadFull: (@Sendable (String) async -> Data?)?,
        onReply: @escaping (_ text: String, _ images: [Data], _ privately: Bool) -> Void
    ) async {
        // Never yank an open reply field from under the user — wait until
        // the reply is sent or dismissed.
        while let current = currentModel, current.replying, !current.replySent {
            try? await Task.sleep(for: .seconds(0.25))
            guard generation == showGeneration else { return }
        }

        hideTask?.cancel()
        hoverObservation = nil
        removeClickMonitors()
        turnOffHoverCopy()
        onIndicatorHover = nil
        hideIndicator()
        if let previous = currentNotch {
            // hide() collapses immediately; afterwards a newer message may
            // already have taken over.
            await previous.hide()
            guard generation == showGeneration else { return }
        }
        userInteractedWithMessage = false

        let model = MessageDisplayModel()
        // Replies default to the channel the message came in on.
        model.replyPrivately = message.isDirect
        // Per-image loaders the grid cells call on appear (lazy full fetch).
        if let loadFull {
            var loaders: [String: @Sendable () async -> Data?] = [:]
            for image in message.images {
                let id = image.id
                loaders[id] = { await loadFull(id) }
            }
            model.imageLoaders = loaders
        }
        // The expanded state shows what else arrived in the last minute
        // before this message.
        pruneHistory()
        model.history = visibleHistory(excluding: entryID)
        currentEntryID = entryID
        currentModel = model
        // The hover-"C" shortcut copies this when the pointer isn't over a
        // history row (see MessageDisplayModel.copyHovered).
        model.currentText = message.text

        // The display chosen in Settings (or the active screen when set to
        // automatic / the chosen one is unplugged). One measurement drives both
        // panel placement and content layout.
        let targetScreen: @MainActor () -> NSScreen? = { DisplayPreference.resolvedScreen() }
        let notchSize = NotchScreenMetrics.metrics(for: targetScreen()).notchSize
        let notch = NotchPanel(hoverBehavior: .all, targetScreen: targetScreen) {
            MessageNotchContainer(
                model: model,
                message: message,
                notchSize: notchSize,
                onReply: { [weak self] reply, images, privately in
                    onReply(reply, images, privately)
                    self?.replyWasSent()
                },
                onCancelReply: { [weak self] in
                    self?.cancelReply()
                },
                onPickFile: { [weak self, weak model] in
                    guard let self, let model else { return }
                    self.pickImageFile(model: model)
                }
            ) { [weak self] in
                self?.teaserFinished()
            }
        }
        notch.transitionConfiguration = .init(
            openingAnimation: .spring(response: 0.6, dampingFraction: 0.7),
            skipIntermediateHides: true
        )
        // Image messages get a free-floating Quick-Look preview that pops below
        // the notch on cell hover (see ImagePreviewOverlay / AlbumCell). It
        // renders inside this same capture-excluded panel window.
        if message.isImage {
            notch.floatingOverlay = AnyView(
                ImagePreviewOverlay(model: model, images: message.images)
            )
        }
        currentNotch = notch

        hoverObservation = notch.$isHovering
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self, weak notch] hovering in
                guard let self, let notch else { return }
                Task { @MainActor in
                    if hovering {
                        self.userInteractedWithMessage = true
                        self.hideTask?.cancel()
                        // Animate the teaser→expanded morph explicitly: the
                        // implicit `.animation(value:)` inside MessageNotchContainer
                        // isn't honored through the NSHostingView host, so the
                        // expand would otherwise snap open without a transition.
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                            self.currentModel?.fullyExpanded = true
                        }
                    } else {
                        // Leaving the notch entirely dismisses the hover image
                        // preview even if a cell's own `.onHover(false)` didn't
                        // fire (the same teardown-unreliability the hover-copy
                        // hotkey guards against).
                        self.currentModel?.clearPreview(animated: true)
                        if self.currentModel?.replying != true {
                            // While the reply field is open, leaving the notch
                            // must not tear it down mid-typing.
                            self.scheduleHide(of: notch, after: self.afterReadDelay)
                        }
                    }
                }
            }

        // Arm the bare-"C" copy hotkey whenever the notch is hovered and no
        // reply field is open. "C" then copies the hovered history row, or the
        // current (newest) message when the pointer isn't over a row (see
        // MessageDisplayModel.copyHovered). Gated this way it never eats a "C"
        // typed away from the notch, and while replying "C" types into the field.
        hoverCopyObservation = Publishers.CombineLatest(notch.$isHovering, model.$replying)
            .map { hovering, replying in hovering && !replying }
            .removeDuplicates()
            .sink { active in
                if active {
                    KeyboardShortcuts.enable(.copyHoveredHistory)
                } else {
                    KeyboardShortcuts.disable(.copyHoveredHistory)
                }
            }

        await notch.expand()
        // Belt-and-suspenders. The panel is already non-capturable from birth
        // (NotchPanelWindow sets sharingType in init) and the frame-exact
        // protection is the CaptureExclusion view at the content root; this
        // cheap re-assertion stays purely as insurance for the core promise.
        notch.panel?.sharingType = NSWindow.munkelCaptureSharingType
        notchVisible = true
        installClickMonitors(for: notch, model: model)
        startHistoryPruning(model: model)

        // Album images load lazily per grid cell (see AlbumCell) once the
        // notch is expanded — no eager fetch here.

        // The text teaser sizes its safety timeout to the scroll length; an
        // image teaser has no ticker, so give it a fixed generous window.
        let safety: Duration = message.isImage ? .seconds(20) : safetyDuration(for: message.text)
        scheduleHide(of: notch, after: safety)
    }

    /// Expires history entries live while the notch is on screen, so rows
    /// vanish from the expanded view the moment they turn 60 seconds old.
    private func startHistoryPruning(model: MessageDisplayModel) {
        pruneTask?.cancel()
        pruneTask = Task { [weak self, weak model] in
            while !Task.isCancelled, let self, let model {
                self.pruneHistory()
                if let id = self.currentEntryID {
                    let visible = self.visibleHistory(excluding: id)
                    if model.history != visible {
                        withAnimation(.spring(duration: 0.3)) {
                            model.history = visible
                        }
                    }
                }
                try? await Task.sleep(for: .seconds(1))
            }
        }
    }

    /// Everything in the buffer except the message that's currently
    /// displayed — chronological, so live-pushed newcomers appear as the
    /// bottom-most row, directly above the current message.
    private func visibleHistory(excluding id: UUID) -> [HistoryEntry] {
        history.filter { $0.id != id }
    }

    private func pruneHistory() {
        history.removeAll { Date().timeIntervalSince($0.receivedAt) > historyWindow }
    }

    /// Click-anywhere-to-reply, at the AppKit level: the panel is not key
    /// until clicked, so the first click would normally be swallowed as
    /// window activation (acceptsFirstMouse). A local monitor sees the
    /// event before that. Transparent panel regions pass clicks through,
    /// so matching the window means the click hit the visible shape.
    /// Clicks anywhere else — own windows (local) or other apps (global,
    /// which never sees own-app events) — dismiss an open reply field.
    private func installClickMonitors(for notch: MessageNotch, model: MessageDisplayModel) {
        clickMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak self, weak notch, weak model] event in
            MainActor.assumeIsolated {
                guard let self, let model, let panel = notch?.panel else { return }
                if event.window === panel {
                    self.userInteractedWithMessage = true
                    // hitTest is useless here (NSHostingView returns
                    // itself wherever SwiftUI content covers the marker),
                    // so clicks are matched against the marker frames via
                    // AppKit coordinate conversion instead. A hovered album
                    // image's copy glyph wins first (copy that picture, bytes
                    // resolved now so full-vs-thumb is decided at click time),
                    // then a hovered history row's copy glyph (copy that row),
                    // then history clicks toggle the truncation, then clicks on
                    // the current message open the reply — everything else on the
                    // shape is inert (buttons handle themselves). The image copy
                    // falls through to nothing else, so reply does not open.
                    if let target = model.imageCopyTargets.first(where: { Self.click(event, lands: $0.view) }) {
                        model.copyImage(id: target.id, data: target.resolve())
                    } else if let target = model.historyCopyTargets.first(where: { Self.click(event, lands: $0.view) }) {
                        model.copyHistory(id: target.id, text: target.text)
                    } else if Self.click(event, lands: model.historyMarker) {
                        withAnimation(.spring(duration: 0.3)) {
                            model.historyExpanded.toggle()
                        }
                    } else if Self.click(event, lands: model.replyMarker)
                        || Self.click(event, lands: model.teaserMarker) {
                        self.beginReply(model: model, panel: panel)
                    }
                } else if !self.suppressReplyDismiss {
                    self.cancelReply()
                }
            }
            return event
        }
        outsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, !self.suppressReplyDismiss else { return }
                self.cancelReply()
            }
        }
    }

    private static func click(_ event: NSEvent, lands marker: NSView?) -> Bool {
        guard let marker, marker.window === event.window else { return false }
        return marker.bounds.contains(marker.convert(event.locationInWindow, from: nil))
    }

    /// Hard off-switch for the bare-"C" hotkey, independent of hover state.
    /// SwiftUI's `.onHover(false)` doesn't reliably fire when the notch is torn
    /// down, so the hotkey must be force-disabled on every hide — otherwise a
    /// stale-enabled "C" would keep swallowing the key after the notch is gone.
    private func turnOffHoverCopy() {
        hoverCopyObservation = nil
        currentModel?.hoveredHistoryID = nil
        // Same teardown rationale as the hover-copy hotkey: clear the hover
        // image preview here, on every hide, since a cell's `.onHover(false)`
        // doesn't reliably fire when the notch is torn down. clearPreview also
        // cancels any in-flight debounce so it can't re-set the flag afterwards.
        currentModel?.clearPreview()
        KeyboardShortcuts.disable(.copyHoveredHistory)
    }

    private func removeClickMonitors() {
        if let clickMonitor {
            NSEvent.removeMonitor(clickMonitor)
        }
        clickMonitor = nil
        if let outsideClickMonitor {
            NSEvent.removeMonitor(outsideClickMonitor)
        }
        outsideClickMonitor = nil
    }

    private func beginReply(model: MessageDisplayModel, panel: NSWindow) {
        guard !model.replying, !model.replySent else { return }
        hideTask?.cancel()
        // Opening the reply field dismisses any hover preview (and cancels a
        // pending debounce) so it can't obscure the text field.
        model.clearPreview()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
            model.fullyExpanded = true
            model.replying = true
        }
        // The nonactivating panel can become key (NotchPanelWindow
        // overrides canBecomeKey) — required for typing into the field.
        panel.makeKeyAndOrderFront(nil)
    }

    private func cancelReply() {
        guard let notch = currentNotch, let model = currentModel,
              model.replying, !model.replySent else { return }
        // Explicit for the same reason as the hover expand: the implicit
        // animation doesn't fire through the NSHostingView host, so closing
        // the reply field would otherwise snap shut.
        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
            model.replying = false
            model.attachedImages = []
        }
        scheduleHide(of: notch, after: afterReadDelay)
    }

    /// Opens an NSOpenPanel to attach image files to the open reply. The notch
    /// panel is non-activating and dismisses on any outside click, so the
    /// global dismiss monitor and the hide timer must be suspended for the
    /// duration of the modal, then the panel re-made-key. The OS file browser
    /// renders no notch/message content, so it does not breach the capture
    /// exclusion (the invariant forbids drawing NOTCH content in a separate
    /// window, which this dialog does not do).
    private func pickImageFile(model: MessageDisplayModel) {
        guard model.replying, model.canAttachMore, let panel = currentNotch?.panel else { return }
        // The modal NSOpenPanel runs in-process (the app isn't sandboxed), so its
        // clicks reach both click monitors carrying the dialog's own window — which
        // the monitors would read as "clicked outside the notch" and collapse the
        // reply, dropping the images just picked. Suppress the dismiss for the
        // modal's duration (mirrors CommandPalettePresenter.suppressResignHide)
        // instead of tearing the monitors down. Also pause the auto-hide.
        suppressReplyDismiss = true
        hideTask?.cancel()
        defer {
            suppressReplyDismiss = false
            // The open dialog took key focus; hand it back so the reply field
            // stays live and keeps accepting input.
            panel.makeKeyAndOrderFront(nil)
        }
        let open = NSOpenPanel()
        open.allowedContentTypes = [.image]
        open.allowsMultipleSelection = true
        open.canChooseDirectories = false
        NSApp.activate(ignoringOtherApps: true)
        guard open.runModal() == .OK else { return }
        for url in open.urls {
            guard model.canAttachMore else { break }
            // Skip an unreadable selection rather than abandoning the rest.
            guard let data = try? Data(contentsOf: url) else { continue }
            model.attach(data)
        }
    }

    private func replyWasSent() {
        guard let notch = currentNotch, let model = currentModel else { return }
        userInteractedWithMessage = true
        hideIndicator()
        withAnimation(.spring(duration: 0.3)) {
            model.replying = false
            model.replySent = true
            model.attachedImages = []
        }
        scheduleHide(of: notch, after: .seconds(1.2))
    }

    private func teaserFinished() {
        guard let notch = currentNotch, currentModel?.fullyExpanded != true else { return }
        scheduleHide(of: notch, after: afterTeaserDelay)
    }

    private func scheduleHide(of notch: MessageNotch, after delay: Duration) {
        hideTask?.cancel()
        hideTask = Task { [weak self, weak notch] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let notch else { return }
            await notch.hide()
            self?.notchVisible = false
            self?.pruneTask?.cancel()
            self?.turnOffHoverCopy()
            if !(self?.userInteractedWithMessage ?? true) {
                self?.showIndicator()
            }
        }
    }

    /// Show the unread indicator (blue dot) in the notch.
    private func showIndicator() {
        guard indicatorNotch == nil else { return }

        let targetScreen: @MainActor () -> NSScreen? = { DisplayPreference.resolvedScreen() }
        let indicator = IndicatorNotch(hoverBehavior: .all, targetScreen: targetScreen) {
            UnreadIndicatorView()
        }
        indicator.transitionConfiguration = .init(
            openingAnimation: .spring(response: 0.6, dampingFraction: 0.7),
            skipIntermediateHides: true
        )
        indicatorNotch = indicator

        indicatorHoverObservation = indicator.$isHovering
            .filter { $0 }
            .sink { [weak self, weak indicator] _ in
                Task { @MainActor in
                    guard let self, let indicator else { return }
                    await indicator.hide()
                    self.indicatorNotch = nil
                    self.indicatorHoverObservation = nil
                    let reveal = self.onIndicatorHover
                    self.onIndicatorHover = nil
                    reveal?()
                }
            }

        Task {
            await indicator.expand()
            if let panel = indicator.panel {
                panel.sharingType = NSWindow.munkelCaptureSharingType
            }
        }
    }

    /// Hide the unread indicator.
    private func hideIndicator() {
        Task { [weak self] in
            if let indicator = self?.indicatorNotch {
                await indicator.hide()
                self?.indicatorNotch = nil
            }
        }
    }

    /// Show the GitHub device-flow user code in the notch. Driven by AppModel's
    /// `.awaitingUser` login state, it stays up — focus-independent, unlike the
    /// `.transient` menu-bar popover — until the flow leaves that state. A
    /// second call while already shown is a no-op.
    func showAuthCode(_ code: String) {
        let previous = authCodeOp
        authCodeOp = Task { [weak self] in
            await previous?.value
            // Idempotent: a panel is already up for this flow. This relies on
            // every new `.awaitingUser` being preceded by a non-`.awaitingUser`
            // state (startGitHubLogin sets `.requestingCode`), which runs
            // hideAuthCode and nils this first — so a fresh code always rebuilds.
            guard let self, self.authCodeNotch == nil else { return }
            // The notch slot holds one panel: clear a stale unread indicator
            // that could linger into a re-login. No message notch can race here
            // — sessions are login-gated, so none are live mid-sign-in.
            self.hideIndicator()
            let targetScreen: @MainActor () -> NSScreen? = { DisplayPreference.resolvedScreen() }
            let notch = AuthCodeNotch(hoverBehavior: .none, targetScreen: targetScreen) {
                AuthCodeNotchView(code: code)
            }
            notch.transitionConfiguration = .init(
                openingAnimation: .spring(response: 0.6, dampingFraction: 0.7),
                skipIntermediateHides: true
            )
            self.authCodeNotch = notch
            await notch.expand()
            if let panel = notch.panel {
                panel.sharingType = NSWindow.munkelCaptureSharingType
            }
        }
    }

    /// Hide the GitHub sign-in code notch.
    func hideAuthCode() {
        let previous = authCodeOp
        authCodeOp = Task { [weak self] in
            await previous?.value
            guard let self, let notch = self.authCodeNotch else { return }
            await notch.hide()
            self.authCodeNotch = nil
        }
    }
}
