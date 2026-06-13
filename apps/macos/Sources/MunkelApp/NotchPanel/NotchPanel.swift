import AppKit
import Combine
import QuartzCore
import SwiftUI

/// Open/closed state of the notch. Top-level (not nested in the generic
/// ``NotchPanel``) so ``NotchHostingContent`` can read it without naming the
/// panel's `Content` type.
enum NotchPanelState: Equatable {
    case expanded
    case hidden
}

/// A borderless notch panel that hosts arbitrary SwiftUI `Content` under the
/// hardware notch and animates it open/closed. It hosts a view, animates, and
/// publishes ``isHovering``; it knows nothing about messages, history, replies
/// or clicks. The app (`NotchPresenter`) owns all of that.
///
/// Three properties matter for correctness:
/// - `sharingType = .none` is guaranteed at panel birth (see ``NotchPanelWindow``),
///   so no capturable panel ever reaches the screen — the panel never leaks into
///   a screen share.
/// - ``hide()`` collapses when called; it does NOT defer while the pointer hovers.
///   The app owns hide timing.
/// - on a screen-parameter change the existing panel is repositioned, never
///   rebuilt, so it stays non-capturable and keeps a stable window identity.
@MainActor
final class NotchPanel<Content: View>: ObservableObject {
    /// Hover behaviour at the call site. Only `.all` is used by the app.
    enum HoverBehavior: Sendable {
        /// Publish ``isHovering`` for the whole shape, cutout strip included.
        case all
        /// Never publish hover.
        case none
    }

    /// Transition configuration: the opening animation and whether to skip the
    /// intermediate hide step. Defaults are the notch opening spring.
    struct TransitionConfiguration: Sendable {
        var openingAnimation: Animation
        var skipIntermediateHides: Bool

        init(
            openingAnimation: Animation = .spring(response: 0.6, dampingFraction: 0.7),
            skipIntermediateHides: Bool = true
        ) {
            self.openingAnimation = openingAnimation
            self.skipIntermediateHides = skipIntermediateHides
        }
    }

    // MARK: - Published state (read by NotchHostingContent)

    @Published private(set) var isHovering = false
    @Published private(set) var state: NotchPanelState = .hidden
    @Published private(set) var notchSize: CGSize = .zero
    /// Whether the resolved target screen has a notch (notch vs floating chrome).
    @Published private(set) var hasNotch = false

    // MARK: - Configuration

    var transitionConfiguration = TransitionConfiguration()
    let content: Content

    private let hoverBehavior: HoverBehavior
    private let targetScreen: @MainActor () -> NSScreen?

    /// Fixed default — only the opening animation is configurable.
    private let closingAnimation: Animation = .smooth(duration: 0.4)

    // MARK: - Window

    private var panelWindow: NotchPanelWindow?
    private var closePanelTask: Task<Void, Never>?
    private var screenChangeObservation: AnyCancellable?

    /// The live panel, or `nil` before the first ``expand()``. Exposed so the app
    /// can set `sharingType`, hit-test clicks (`event.window === panel`) and
    /// `makeKeyAndOrderFront` the reply field — replaces `windowController?.window`.
    var panel: NSPanel? { panelWindow }

    init(
        hoverBehavior: HoverBehavior = .all,
        targetScreen: @escaping @MainActor () -> NSScreen? = { NSScreen.main },
        @ViewBuilder content: () -> Content
    ) {
        self.hoverBehavior = hoverBehavior
        self.targetScreen = targetScreen
        self.content = content()

        // Reposition (never rebuild capturable) on display plug/unplug, resolution
        // or AirPlay change. The AnyCancellable cancels on dealloc — no manual
        // cleanup, and the sink only holds a weak self.
        screenChangeObservation = NotificationCenter.default
            .publisher(for: NSApplication.didChangeScreenParametersNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.handleScreenChange()
                }
            }
    }

    // MARK: - Hover

    /// Called by ``NotchHostingContent``'s `.onHover`. The app consumes the
    /// published value and decides what it means (expand / schedule hide).
    func updateHoverState(_ hovering: Bool) {
        guard hoverBehavior == .all else { return }
        guard state != .hidden, hovering != isHovering else { return }
        isHovering = hovering
    }

    // MARK: - Lifecycle

    func expand() async {
        guard state != .expanded else { return }
        closePanelTask?.cancel()

        guard let screen = targetScreen() ?? NSScreen.main ?? NSScreen.screens.first else { return }
        let metrics = NotchScreenMetrics.metrics(for: screen)
        notchSize = metrics.notchSize
        hasNotch = metrics.hasNotch

        if panelWindow == nil {
            buildPanel(on: screen)
        } else {
            reposition(on: screen)
        }

        // Start the animation before ordering the window front — eliminates the
        // open stutter.
        withAnimation(transitionConfiguration.openingAnimation) {
            state = .expanded
        }
        showWindow()

        // Time for the opening animation to settle. The app's serialization
        // cadence depends on this ~0.4s — keep it.
        try? await Task.sleep(for: .seconds(0.4))
    }

    func hide() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            _hide { continuation.resume() }
        }
    }

    /// Collapses immediately when called — no keepVisible-defer. Fades the panel
    /// out, then tears the window down (which breaks the hosting-view retain
    /// cycle so this `NotchPanel` can deallocate).
    private func _hide(completion: @escaping () -> Void) {
        guard state != .hidden else {
            completion()
            return
        }
        withAnimation(closingAnimation) {
            state = .hidden
            isHovering = false
        }
        closePanelTask?.cancel()
        closePanelTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(0.25)) // most of the closing animation
            guard !Task.isCancelled else { return }
            await self?.fadeOutWindow()
            guard !Task.isCancelled else { return }
            self?.deinitializeWindow()
            completion()
        }
    }

    // MARK: - Window management

    private func buildPanel(on screen: NSScreen) {
        let window = NotchPanelWindow()
        window.contentView = NSHostingView(rootView: NotchHostingContent(owner: self))
        window.setFrame(NotchScreenMetrics.panelFrame(for: screen), display: false)
        window.layoutIfNeeded()
        window.applyCaptureExclusion()
        panelWindow = window
    }

    private func reposition(on screen: NSScreen) {
        guard let window = panelWindow else { return }
        window.setFrame(NotchScreenMetrics.panelFrame(for: screen), display: true)
        // Re-assert the panel properties that a window reconfigure can drop.
        window.applyCaptureExclusion()
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .stationary]
    }

    private func showWindow() {
        guard let window = panelWindow else { return }
        // Start invisible to hide any initial frame glitch, then fade in.
        window.alphaValue = 0
        window.orderFrontRegardless()
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.15
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            window.animator().alphaValue = 1
        }
    }

    private func fadeOutWindow() async {
        guard let window = panelWindow else { return }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            NSAnimationContext.runAnimationGroup({ context in
                context.duration = 0.15
                context.timingFunction = CAMediaTimingFunction(name: .easeIn)
                window.animator().alphaValue = 0
            }, completionHandler: {
                continuation.resume()
            })
        }
    }

    private func deinitializeWindow() {
        panelWindow?.orderOut(nil)
        panelWindow?.close()
        panelWindow = nil
    }

    private func handleScreenChange() {
        guard state == .expanded,
              let screen = targetScreen() ?? NSScreen.main ?? NSScreen.screens.first else { return }
        let metrics = NotchScreenMetrics.metrics(for: screen)
        notchSize = metrics.notchSize
        hasNotch = metrics.hasNotch
        reposition(on: screen)
    }
}
