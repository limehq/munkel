import Combine
import Foundation

/// A target the palette can send to: one member, or a whole circle.
struct Recipient: Identifiable, Equatable {
    /// Stable across circles: a member who is in two circles is two distinct
    /// send targets. `\u{1}` can't appear in a code or member id.
    let id: String
    let circle: String       // join code
    let memberId: String?    // nil = broadcast to the whole circle
    let label: String        // display name, or "Everyone"
    let avatar: Data?

    var isEveryone: Bool { memberId == nil }
}

/// Transient palette state, owned by the presenter so it survives the
/// SwiftUI view being rebuilt and can be mutated from the AppKit key
/// monitor. Reads live circle/member data straight from AppModel.
///
/// Single phase: pick a target chip (↑↓ or click) and type in the message
/// field — both live in one compact view, mirroring the in-app circle card.
@MainActor
final class CommandPaletteState: ObservableObject {
    @Published var selectedIndex = 0
    @Published var message = ""

    private weak var app: AppModel?

    init(app: AppModel) {
        self.app = app
    }

    /// Every send target across all joined circles, in circle order: a
    /// broadcast entry per circle, then its online members. The flat order
    /// is what ↑↓ navigates and what `selectedIndex` points into.
    var recipients: [Recipient] {
        guard let app else { return [] }
        return app.groupCodes.flatMap { code -> [Recipient] in
            let members = app.session(for: code)?.members ?? []
            let everyone = Recipient(
                id: "\(code)\u{1}*",
                circle: code,
                memberId: nil,
                label: "Everyone",
                avatar: nil
            )
            let people = members.map { member in
                Recipient(
                    id: "\(code)\u{1}\(member.id)",
                    circle: code,
                    memberId: member.id,
                    label: member.label,
                    avatar: member.avatar
                )
            }
            return [everyone] + people
        }
    }

    var selectedRecipient: Recipient? {
        recipients[safe: selectedIndex]
    }

    func reset() {
        selectedIndex = 0
        message = ""
    }

    // MARK: - D-pad navigation

    enum Direction { case left, right, up, down }

    /// Flat-index ranges, one per circle, in display order.
    private var circleRanges: [Range<Int>] {
        var ranges: [Range<Int>] = []
        let r = recipients
        var i = 0
        while i < r.count {
            let circle = r[i].circle
            var j = i
            while j < r.count, r[j].circle == circle { j += 1 }
            ranges.append(i..<j)
            i = j
        }
        return ranges
    }

    /// Left/right move within the current circle; up/down jump to the
    /// adjacent circle keeping the column (clamped). With a single circle
    /// all four arrows move within it.
    func move(_ dir: Direction) {
        let ranges = circleRanges
        guard !ranges.isEmpty,
              let row = ranges.firstIndex(where: { $0.contains(selectedIndex) })
        else { return }
        let here = ranges[row]
        let col = selectedIndex - here.lowerBound
        let single = ranges.count <= 1

        switch dir {
        case .left:
            selectedIndex = max(here.lowerBound, selectedIndex - 1)
        case .right:
            selectedIndex = min(here.upperBound - 1, selectedIndex + 1)
        case .up:
            if single {
                selectedIndex = max(here.lowerBound, selectedIndex - 1)
            } else {
                let target = ranges[max(0, row - 1)]
                selectedIndex = target.lowerBound + min(col, target.count - 1)
            }
        case .down:
            if single {
                selectedIndex = min(here.upperBound - 1, selectedIndex + 1)
            } else {
                let target = ranges[min(ranges.count - 1, row + 1)]
                selectedIndex = target.lowerBound + min(col, target.count - 1)
            }
        }
    }

    /// Tab navigation: cycle forward/backward through recipients, skipping within-circle
    /// navigation for a streamlined flow. Forward wraps globally; backward does likewise.
    func moveTab(backward: Bool) {
        let r = recipients
        guard !r.isEmpty else { return }

        if backward {
            selectedIndex = selectedIndex == 0 ? r.count - 1 : selectedIndex - 1
        } else {
            selectedIndex = selectedIndex == r.count - 1 ? 0 : selectedIndex + 1
        }
    }
}

extension Collection {
    /// Bounds-checked subscript — nil instead of trapping out of range.
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
