import Foundation
import SwiftUI

struct IncomingMessage: Equatable {
    let sender: String
    let avatarData: Data?
    let text: String
    /// True for a private message (sent only to us), false for a broadcast.
    let isDirect: Bool
    /// Code of the circle the message arrived in, with its marker color.
    let group: String
    let groupColor: Color
    /// Whether the user is in more than one circle — below that, group
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
}

/// One entry of the short-lived notch history: messages stay visible in
/// the expanded notch for a fixed time window after arrival, then vanish.
/// RAM-only by design — nothing is ever persisted.
struct HistoryEntry: Identifiable, Equatable {
    let id = UUID()
    let sender: String
    let text: String
    let isDirect: Bool
    let group: String
    let groupColor: Color
    let receivedAt: Date
}
