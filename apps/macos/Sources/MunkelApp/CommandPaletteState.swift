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
@MainActor
final class CommandPaletteState: ObservableObject {
    @Published var query = ""
    @Published var selectedIndex = 0
    /// nil → picking a recipient (phase 1); set → composing (phase 2).
    @Published var target: Recipient?
    @Published var message = ""

    private weak var app: AppModel?

    init(app: AppModel) {
        self.app = app
    }

    /// Every send target across all joined circles: a broadcast entry per
    /// circle, then its online members.
    var allRecipients: [Recipient] {
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

    var filteredRecipients: [Recipient] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return allRecipients }
        return allRecipients.filter {
            $0.label.localizedCaseInsensitiveContains(q)
                || $0.circle.localizedCaseInsensitiveContains(q)
        }
    }

    var selectedRecipient: Recipient? {
        filteredRecipients[safe: selectedIndex]
    }

    func reset() {
        query = ""
        selectedIndex = 0
        target = nil
        message = ""
    }
}

extension Collection {
    /// Bounds-checked subscript — nil instead of trapping out of range.
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
