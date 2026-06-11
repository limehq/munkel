import Combine
import DynamicNotchKit
import SwiftUI

/// Presents incoming messages in the notch — deliberately unobtrusive:
/// only the sender's avatar appears compact next to the notch; hovering
/// expands to the full message with the copy button. DynamicNotchKit itself
/// defers hiding while the pointer is over the notch.
@MainActor
final class NotchPresenter {
    private typealias MessageNotch = DynamicNotch<MessageNotchView, CompactAvatarView, CompactMessageTicker>

    private var currentNotch: MessageNotch?
    private var hideTask: Task<Void, Never>?
    private var hoverObservation: AnyCancellable?

    /// How long the compact avatar stays when the message is never hovered.
    private let compactDuration: Duration = .seconds(6)
    /// Grace period after the pointer leaves the expanded message.
    private let afterReadDelay: Duration = .seconds(1)

    func show(sender: String, text: String) async {
        hideTask?.cancel()
        hoverObservation = nil
        if let previous = currentNotch {
            await previous.hide()
        }

        let message = IncomingMessage(sender: sender, text: text)
        let notch = DynamicNotch(hoverBehavior: .all) {
            MessageNotchView(message: message)
        } compactLeading: {
            CompactAvatarView(name: message.sender)
        } compactTrailing: {
            CompactMessageTicker(text: message.text)
        }
        // Livelier panel entrance; hover-expand converts directly instead of
        // hiding in between.
        notch.transitionConfiguration = .init(
            openingAnimation: .spring(response: 0.6, dampingFraction: 0.7),
            conversionAnimation: .spring(response: 0.35, dampingFraction: 0.7),
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
                        await notch.expand()
                    } else {
                        self.scheduleHide(of: notch, after: self.afterReadDelay)
                    }
                }
            }

        await notch.compact()
        scheduleHide(of: notch, after: compactDuration)
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
