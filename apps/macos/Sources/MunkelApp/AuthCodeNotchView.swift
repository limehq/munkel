import SwiftUI

/// Shows the GitHub device-flow code in the notch while authorization is
/// pending. The notch stays visible after focus changes, unlike the transient
/// menu-bar popover.
struct AuthCodeNotchView: View {
    let code: String

    var body: some View {
        VStack(spacing: 4) {
            Label("GitHub sign-in", systemImage: "person.crop.circle.badge.checkmark")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.white.opacity(0.6))
                .labelStyle(.titleAndIcon)

            Text(code)
                .font(.system(.title2, design: .monospaced).weight(.bold))
                .foregroundStyle(.white)

            Label("Copied — paste on github.com", systemImage: "doc.on.clipboard")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.6))
                .labelStyle(.titleAndIcon)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        // Keep the code out of screen captures; the non-capturable panel is the
        // primary guard, and this root exclusion is the second layer.
        .excludedFromScreenCapture()
    }
}

#Preview {
    AuthCodeNotchView(code: "1A2B-C3D4")
        .padding(40)
        .background(Color.black)
}
