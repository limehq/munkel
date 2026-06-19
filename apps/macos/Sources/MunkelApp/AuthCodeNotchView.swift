import SwiftUI

/// The GitHub device-flow user code, shown in the notch while a sign-in is
/// waiting for the user to authorize on github.com. The menu-bar popover that
/// normally carries the code is `.transient`, so it dismisses the instant the
/// browser steals focus — taking the code with it. The notch panel is a
/// non-activating window that stays put across focus changes, so the code (and
/// the reminder that it's already on the clipboard) keeps glanceable while the
/// user is over on github.com pasting it.
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
        // The device code must never leak into a screen share. The panel
        // window is already non-capturable (sharingType), but the rule wants
        // the content layer covered too — on the root, outside any conditional
        // branch — so nothing slips through while the view is mounting. See
        // CaptureExclusion, and MessageNotchContainer / CommandPaletteView.
        .excludedFromScreenCapture()
    }
}

#Preview {
    AuthCodeNotchView(code: "1A2B-C3D4")
        .padding(40)
        .background(Color.black)
}
