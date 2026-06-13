import SwiftUI

extension Color {
    /// Fixed, clearly distinct palette for circle markers. Assigned by the
    /// circle's position in the joined list, so circles never collide
    /// locally (a content hash could — and did). Green and orange are
    /// deliberately absent: the menu already uses them as connection
    /// status, and the dot must not read as "online".
    private static let groupPalette: [Color] = [
        .blue, .purple, .pink, .teal, .yellow, .indigo, .mint, .brown,
    ]

    static func groupColor(index: Int) -> Color {
        groupPalette[index % groupPalette.count]
    }
}
