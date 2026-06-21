import Combine
import Foundation
import MunkelKit

/// A target the palette can send to: one member, or a whole channel.
struct Recipient: Identifiable, Equatable {
    /// Stable across channels: a member who is in two channels is two distinct
    /// send targets. `\u{1}` can't appear in a code or member id.
    let id: String
    let channel: String       // join code
    let memberId: String?    // nil = broadcast to the whole channel
    let label: String        // display name, or "Everyone"
    let avatar: Data?
    let status: PresenceStatus?

    var isEveryone: Bool { memberId == nil }
}

/// Transient palette state, owned by the presenter so it survives the
/// SwiftUI view being rebuilt and can be mutated from the AppKit key
/// monitor. Reads live channel/member data straight from AppModel.
///
/// Single phase: pick a target chip (↑↓ or click) and type in the message
/// field — both live in one compact view, mirroring the in-app channel card.
@MainActor
final class CommandPaletteState: ObservableObject {
    @Published var selectedIndex = 0
    @Published var message = ""
    /// Images staged for sending (an album): pasted with ⌘V or uploaded from
    /// files via the paperclip. When non-empty, Return sends the pictures (any
    /// typed text rides along as the shared caption).
    @Published var attachedImages: [Data] = []

    private weak var app: AppModel?

    init(app: AppModel) {
        self.app = app
    }

    var canAttachMore: Bool { attachedImages.count < AppPayload.maxImagesPerMessage }

    /// Append a staged image (from the file picker), up to the per-message cap.
    func attach(_ data: Data) {
        if canAttachMore { attachedImages.append(data) }
    }

    /// Append the clipboard's image, if any. Returns whether one was added.
    /// Called from the palette's ⌘V key monitor (the app has no Edit menu
    /// wiring `paste:`, so SwiftUI's onPasteCommand never fires).
    @discardableResult
    func attachClipboardImage() -> Bool {
        guard canAttachMore, let data = ClipboardImage.read() else { return false }
        attachedImages.append(data)
        return true
    }

    /// Every send target across all joined channels, in channel order: a
    /// broadcast entry per channel, then its online members. The flat order
    /// is what ↑↓ navigates and what `selectedIndex` points into.
    var recipients: [Recipient] {
        guard let app else { return [] }
        return app.groupCodes.flatMap { code -> [Recipient] in
            let members = app.session(for: code)?.members ?? []
            let everyone = Recipient(
                id: "\(code)\u{1}*",
                channel: code,
                memberId: nil,
                label: "Everyone",
                avatar: nil,
                status: nil
            )
            let people = members.map { member in
                Recipient(
                    id: "\(code)\u{1}\(member.id)",
                    channel: code,
                    memberId: member.id,
                    label: member.label,
                    avatar: member.avatar,
                    status: member.status
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
        attachedImages = []
    }

    // MARK: - D-pad navigation

    enum Direction { case left, right, up, down }

    /// Flat-index ranges, one per channel, in display order.
    private var channelRanges: [Range<Int>] {
        var ranges: [Range<Int>] = []
        let r = recipients
        var i = 0
        while i < r.count {
            let channel = r[i].channel
            var j = i
            while j < r.count, r[j].channel == channel { j += 1 }
            ranges.append(i..<j)
            i = j
        }
        return ranges
    }

    /// Left/right move within the current channel; up/down jump to the
    /// adjacent channel keeping the column (clamped). With a single channel
    /// all four arrows move within it.
    func move(_ dir: Direction) {
        let ranges = channelRanges
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

    /// Tab navigation: cycle forward/backward through recipients, skipping within-channel
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
