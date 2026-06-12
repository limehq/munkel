import AppKit
import Combine
import DynamicNotchKit
import SwiftUI

/// Presents the menu as an expanded notch on hover — same DynamicNotchKit
/// machinery as message display, so the visual is consistent: the notch
/// appears to grow into a black menu panel.
@MainActor
final class NotchMenuPresenter {
    private typealias MenuNotch = DynamicNotch<NotchMenuView, EmptyView, EmptyView>

    private var currentNotch: MenuNotch?
    private var hoverObservation: AnyCancellable?
    private var hideTask: Task<Void, Never>?

    /// Grace period after the pointer leaves the expanded menu.
    private let afterLeaveDelay: Duration = .milliseconds(500)

    func show(model: AppModel) {
        // Already showing — don't recreate
        if currentNotch != nil { return }

        hideTask?.cancel()

        let notch = DynamicNotch(hoverBehavior: .all) {
            NotchMenuView(model: model)
        }
        notch.transitionConfiguration = .init(
            openingAnimation: .spring(response: 0.5, dampingFraction: 0.75),
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
                    } else {
                        self.scheduleHide(of: notch, after: self.afterLeaveDelay)
                    }
                }
            }

        Task {
            await notch.expand()
        }
    }

    func hide() {
        hideTask?.cancel()
        hoverObservation = nil
        guard let notch = currentNotch else { return }
        currentNotch = nil
        Task {
            await notch.hide()
        }
    }

    private func scheduleHide(of notch: MenuNotch, after delay: Duration) {
        hideTask?.cancel()
        hideTask = Task { [weak self, weak notch] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let notch else { return }
            await notch.hide()
            await MainActor.run { [weak self] in
                self?.currentNotch = nil
                self?.hoverObservation = nil
            }
        }
    }
}
