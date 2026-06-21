import SwiftUI

extension Color {
    // Distinct palette for channel markers; avoids green/orange because the menu
    // already uses them for connection status.
    private static let groupPalette: [Color] = [
        .blue, .purple, .pink, .teal, .yellow, .indigo, .mint, .brown,
    ]

    static func groupColor(index: Int) -> Color {
        groupPalette[index % groupPalette.count]
    }
}
