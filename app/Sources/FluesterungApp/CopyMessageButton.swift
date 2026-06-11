import AppKit
import SwiftUI

/// Puts the full message text on the clipboard, morphing briefly into a
/// green checkmark as confirmation.
struct CopyMessageButton: View {
    let text: String
    var diameter: CGFloat = 28

    @State private var copied = false

    var body: some View {
        Button(action: copy) {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.system(size: diameter * 0.43, weight: .semibold))
                .foregroundStyle(copied ? Color.green : .white.opacity(0.65))
                .contentTransition(.symbolEffect(.replace))
                .frame(width: diameter, height: diameter)
                .background(.white.opacity(0.1), in: Circle())
        }
        .buttonStyle(.plain)
        .help("Nachricht kopieren")
    }

    private func copy() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        withAnimation(.spring(duration: 0.3)) { copied = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.spring(duration: 0.3)) { copied = false }
        }
    }
}
