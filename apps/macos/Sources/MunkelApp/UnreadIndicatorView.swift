import SwiftUI

/// Unread message indicator: a blue dot with black background shown in the
/// notch when a message arrives but the user hasn't interacted with the app.
/// Disappears on any interaction (hover, click, send).
struct UnreadIndicatorView: View {
    var body: some View {
        Circle()
            .fill(Color.blue)
            .frame(width: 12, height: 12)
            .background(.black, in: Circle())
    }
}

#Preview {
    UnreadIndicatorView()
        .frame(width: 40, height: 40)
        .background(Color.gray)
}
