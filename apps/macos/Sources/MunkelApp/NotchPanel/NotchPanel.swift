import AppKit
import Combine
import QuartzCore
import SwiftUI

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
/// - the capture sharing type is guaranteed at panel birth (see ``NotchPanelWindow``),
///   so no capturable panel ever reaches the screen — the panel never leaks into
///   a screen share. It resolves to `.none` in release; a DEBUG-only toggle can
///   relax it to `.readOnly` for screenshots (see ``CaptureExclusion``).
/// - ``hide()`` collapses when called; it does NOT defer while the pointer hovers.
///   The app owns hide timing.
/// - on a screen-parameter change the existing panel is repositioned, never
///   rebuilt, so it stays non-capturable and keeps a stable window identity.
@MainActor
final class NotchPanel<Content: View>: ObservableObject {
    enum HoverBehavior: Sendable {
        case all
        case none
    }

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

    @Published private(set) var isHovering = false
    @Published private(set) var state: NotchPanelState = .hidden
    @Published private(set) var notchSize: CGSize = .zero
    @Published private(set) var hasNotch = false

    var transitionConfiguration = TransitionConfiguration()
    let content: Content

    var floatingOverlay: AnyView?

    private let hoverBehavior: HoverBehavior
    private let targetScreen: @MainActor () -> NSScreen?

    private let closingAnimation: Animation = .smooth(duration: 0.4)

    private var panelWindow: NotchPanelWindow?
    private var closePanelTask: Task<Void, Never>?
    private var screenChangeObservation: AnyCancellable?

    var panel: NSPanel? { panelWindow }

    init(
        hoverBehavior: HoverBehavior = .all,
        targetScreen: @escaping @MainActor () -> NSScreen? = { NSScreen.main },
        @ViewBuilder content: () -> Content
    ) {
        self.hoverBehavior = hoverBehavior
        self.targetScreen = targetScreen
        self.content = content()

        screenChangeObservation = NotificationCenter.default
            .publisher(for: NSApplication.didChangeScreenParametersNotification)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.handleScreenChange()
                }
            }
    }

    func updateHoverState(_ hovering: Bool) {
        guard hoverBehavior == .all else { return }
        guard state != .hidden, hovering != isHovering else { return }
        isHovering = hovering
    }

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

        withAnimation(transitionConfiguration.openingAnimation) {
            state = .expanded
        }
        showWindow()

        try? await Task.sleep(for: .seconds(0.4))
    }

    func hide() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            _hide { continuation.resume() }
        }
    }

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
            try? await Task.sleep(for: .seconds(0.25))
            guard !Task.isCancelled else { return }
            await self?.fadeOutWindow()
            guard !Task.isCancelled else { return }
            self?.deinitializeWindow()
            completion()
        }
    }

    private func buildPanel(on screen: NSScreen) {
        let window = NotchPanelWindow()
        window.contentView = NSHostingView(rootView: NotchHostingContent(owner: self))
        window.setFrame(panelFrame(on: screen), display: false)
        window.layoutIfNeeded()
        window.applyCaptureExclusion()
        panelWindow = window
    }

    private func reposition(on screen: NSScreen) {
        guard let window = panelWindow else { return }
        window.setFrame(panelFrame(on: screen), display: true)
        window.applyCaptureExclusion()
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .stationary]
    }

    /// Panels carrying a `floatingOverlay` (the image preview) get the full-width
    /// canvas so it can grow to near-fullscreen; others keep the half-width frame.
    private func panelFrame(on screen: NSScreen) -> NSRect {
        NotchScreenMetrics.panelFrame(for: screen, wide: floatingOverlay != nil)
    }

    private func showWindow() {
        guard let window = panelWindow else { return }
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
