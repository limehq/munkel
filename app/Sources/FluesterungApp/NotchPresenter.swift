import AppKit
import Combine
import DynamicNotchKit
import SwiftUI

/// Presents incoming messages below the notch: a slim one-line teaser
/// (avatar + text scrolling through once), expanding to the full message
/// with the copy button on hover. DynamicNotchKit itself defers hiding
/// while the pointer is over the notch.
@MainActor
final class NotchPresenter {
    private typealias MessageNotch = DynamicNotch<MessageNotchContainer, EmptyView, EmptyView>

    private var currentNotch: MessageNotch?
    private var currentModel: MessageDisplayModel?
    private var hideTask: Task<Void, Never>?
    private var hoverObservation: AnyCancellable?
    private var clickMonitor: Any?

    /// Linger after the teaser finished its single scroll-through.
    private let afterTeaserDelay: Duration = .seconds(2)
    /// Grace period after the pointer leaves the expanded message.
    private let afterReadDelay: Duration = .seconds(1)
    /// Upper bound in case the teaser never reports completion — sized to
    /// the text so long messages aren't cut off mid-scroll. Rough estimate:
    /// ~7pt per character at the ticker's font, scrolling at 24pt/s through
    /// a 250pt window, plus generous start/finish buffers.
    private func safetyDuration(for text: String) -> Duration {
        let scrollSeconds = max(0, (Double(text.count) * 7 - 250) / 24)
        return .seconds(min(90, 10 + scrollSeconds))
    }

    func show(sender: String, text: String) async {
        hideTask?.cancel()
        hoverObservation = nil
        removeClickMonitor()
        if let previous = currentNotch {
            await previous.hide()
        }

        let message = IncomingMessage(sender: sender, text: text)
        let model = MessageDisplayModel()
        currentModel = model

        let notchSize = Self.hardwareNotchSize()
        let notch = DynamicNotch(hoverBehavior: .all) {
            MessageNotchContainer(model: model, message: message, notchSize: notchSize) { [weak self] in
                self?.teaserFinished()
            }
        }
        notch.transitionConfiguration = .init(
            openingAnimation: .spring(response: 0.6, dampingFraction: 0.7),
            skipIntermediateHides: true
        )
        currentNotch = notch

        hoverObservation = notch.$isHovering
            .removeDuplicates()
            .dropFirst()
            .sink { [weak self, weak notch] hovering in
                guard let self, let notch else { return }
                Task { @MainActor in
                    if hovering {
                        self.hideTask?.cancel()
                        self.currentModel?.fullyExpanded = true
                    } else {
                        self.scheduleHide(of: notch, after: self.afterReadDelay)
                    }
                }
            }

        await notch.expand()
        installClickMonitor(for: notch, model: model, text: text)
        scheduleHide(of: notch, after: safetyDuration(for: text))
    }

    /// Click-anywhere-to-copy, at the AppKit level: the panel is never the
    /// key window, so the first click would normally be swallowed as
    /// window activation (acceptsFirstMouse). A local monitor sees the
    /// event before that. Transparent panel regions pass clicks through,
    /// so matching the window means the click hit the visible shape.
    private func installClickMonitor(for notch: MessageNotch, model: MessageDisplayModel, text: String) {
        clickMonitor = NSEvent.addLocalMonitorForEvents(matching: .leftMouseDown) { [weak notch, weak model] event in
            MainActor.assumeIsolated {
                if let panel = notch?.windowController?.window, event.window === panel {
                    model?.copy(text)
                }
            }
            return event
        }
    }

    private func removeClickMonitor() {
        if let clickMonitor {
            NSEvent.removeMonitor(clickMonitor)
        }
        clickMonitor = nil
    }

    private func teaserFinished() {
        guard let notch = currentNotch, currentModel?.fullyExpanded != true else { return }
        scheduleHide(of: notch, after: afterTeaserDelay)
    }

    /// Measures the hardware notch cutout of the screen the notch shows on
    /// (DynamicNotchKit defaults to NSScreen.screens[0]). Zero without notch.
    private static func hardwareNotchSize() -> CGSize {
        guard
            let screen = NSScreen.screens.first,
            screen.safeAreaInsets.top > 0,
            let topLeft = screen.auxiliaryTopLeftArea,
            let topRight = screen.auxiliaryTopRightArea
        else {
            return .zero
        }
        return CGSize(
            width: screen.frame.width - topLeft.width - topRight.width,
            height: screen.safeAreaInsets.top
        )
    }

    private func scheduleHide(of notch: MessageNotch, after delay: Duration) {
        hideTask?.cancel()
        hideTask = Task { [weak notch] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let notch else { return }
            await notch.hide()
        }
    }
}
