import SwiftUI

/// Presentational copy affordance: morphs into a green checkmark while
/// `copied` is true. The copy state lives in MessageDisplayModel so that
/// click-anywhere-to-copy flashes the same feedback.
struct CopyMessageButton: View {
    let copied: Bool
    var diameter: CGFloat = 28
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.system(size: diameter * 0.43, weight: .semibold))
                .foregroundStyle(copied ? Color.green : .white.opacity(0.65))
                .contentTransition(.symbolEffect(.replace))
                .frame(width: diameter, height: diameter)
                .background(.white.opacity(0.1), in: Circle())
        }
        .buttonStyle(.plain)
        // No .help: this button only lives in the notch, and tooltip
        // windows can't inherit the capture exclusion (CaptureExclusion).
    }
}
