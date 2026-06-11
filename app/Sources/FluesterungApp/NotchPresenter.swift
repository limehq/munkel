import DynamicNotchKit
import SwiftUI

/// Presents incoming messages in the notch. One DynamicNotch instance per
/// message; auto-dismiss after a fixed duration. DynamicNotchKit itself
/// defers hiding while the pointer hovers the notch.
@MainActor
final class NotchPresenter {
    private var currentNotch: DynamicNotch<MessageNotchView, EmptyView, EmptyView>?
    private var hideTask: Task<Void, Never>?

    private let displayDuration: Duration = .seconds(5)

    func show(sender: String, text: String) async {
        hideTask?.cancel()
        if let previous = currentNotch {
            await previous.hide()
        }

        let message = IncomingMessage(sender: sender, text: text)
        let notch = DynamicNotch(hoverBehavior: .all) {
            MessageNotchView(message: message)
        }
        currentNotch = notch

        await notch.expand()

        hideTask = Task { [weak notch] in
            try? await Task.sleep(for: displayDuration)
            guard !Task.isCancelled, let notch else { return }
            await notch.hide()
        }
    }
}
