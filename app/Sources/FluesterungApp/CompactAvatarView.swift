import SwiftUI

/// The compact notch state: the sender's avatar pops out from behind the
/// notch with a bouncy spring (Dynamic-Island-style), then announces itself
/// once with a soft pulse ring in the sender's color.
struct CompactAvatarView: View {
    let name: String

    @State private var appeared = false
    @State private var pulsed = false

    var body: some View {
        AvatarView(name: name, size: 20)
            .background {
                Circle()
                    .stroke(AvatarView.palette(for: name).first ?? .white, lineWidth: 1)
                    .scaleEffect(pulsed ? 1.6 : 0.8)
                    .opacity(pulsed ? 0 : 0.9)
            }
            .scaleEffect(appeared ? 1 : 0.3)
            .blur(radius: appeared ? 0 : 4)
            .opacity(appeared ? 1 : 0)
            // Slides in towards its slot from under the notch (which sits
            // to the right of the compact-leading area).
            .offset(x: appeared ? 0 : 12)
            .onAppear {
                withAnimation(.spring(response: 0.55, dampingFraction: 0.6)) {
                    appeared = true
                }
                withAnimation(.easeOut(duration: 1.0).delay(0.55)) {
                    pulsed = true
                }
            }
    }
}
