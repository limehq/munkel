import Foundation
import SwiftUI

struct IncomingMessage: Equatable {
    let sender: String
    let avatarData: Data?
    let text: String
    let isDirect: Bool
    let group: String
    let groupColor: Color
    /// Whether the user is in more than one channel — below that, group
    /// labels are noise and partially hidden.
    let inMultipleGroups: Bool
    /// Images of an album (empty for a plain text message). Each carries its
    /// inline preview thumbnail; the full resolution is fetched lazily per
    /// cell into `MessageDisplayModel.fullImages`.
    var images: [IncomingImage] = []

    var isImage: Bool { !images.isEmpty }
}

/// One image in a received album: its inline thumbnail plus the pixel size and
/// the R2 key (`id`) used to fetch + cache its full resolution.
struct IncomingImage: Equatable, Identifiable, Sendable {
    let id: String
    let thumb: Data
    let width: Int
    let height: Int
    /// MIME of the full image. Animated mimes (`image/gif`) render in a view
    /// that plays them; everything else is a static decode.
    var mime: String = "image/avif"

    /// Whether the full image animates and should be shown in a playing view.
    var isAnimated: Bool { mime == "image/gif" }
}

/// One entry of the short-lived notch history: messages stay visible in
/// the expanded notch for a fixed time window after arrival, then vanish.
/// RAM-only by design — nothing is ever persisted.
struct HistoryEntry: Identifiable, Equatable {
    let id = UUID()
    let sender: String
    /// Collapsed-row label — the body text, or a `📷 …` caption/count for an
    /// album. Also what the per-row copy affordance copies.
    let text: String
    let isDirect: Bool
    let group: String
    let groupColor: Color
    let receivedAt: Date
    let sentAt: Date
    /// Album images for an image message (empty for plain text), carried so the
    /// EXPANDED history can render thumbnails that upgrade to full resolution
    /// just like the current message. RAM-only — gone when the entry is pruned.
    var images: [IncomingImage] = []
    /// The album's real caption (no `📷` prefix), shown beneath the thumbnails
    /// in the expanded view; empty when the album had none.
    var caption: String = ""
    /// Per-image full-resolution loader (R2 fetch keyed by r2Key); nil for a
    /// text entry. Excluded from `Equatable` — closures aren't comparable, and
    /// entries are never reassigned after construction and carry a unique id, so
    /// `==` compares ids alone.
    var loadFull: (@Sendable (String) async -> Data?)?

    var isImage: Bool { !images.isEmpty }

    static func == (lhs: HistoryEntry, rhs: HistoryEntry) -> Bool { lhs.id == rhs.id }
}
