import AppKit
import SwiftUI

/// The notch content for one incoming message: avatar, sender, text, copy.
/// Deliberately read-only — no reply affordance, per product decision.
struct MessageNotchView: View {
    let message: IncomingMessage

    @State private var copied = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            AvatarView(name: message.sender)

            VStack(alignment: .leading, spacing: 2) {
                Text(message.sender)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.55))
                Text(message.text)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(6)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 12)

            copyButton
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .frame(minWidth: 280, maxWidth: 360, alignment: .leading)
    }

    private var copyButton: some View {
        Button(action: copy) {
            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(copied ? Color.green : .white.opacity(0.65))
                .contentTransition(.symbolEffect(.replace))
                .frame(width: 28, height: 28)
                .background(.white.opacity(0.1), in: Circle())
        }
        .buttonStyle(.plain)
        .help("Nachricht kopieren")
    }

    private func copy() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(message.text, forType: .string)

        withAnimation(.spring(duration: 0.3)) { copied = true }
        Task {
            try? await Task.sleep(for: .seconds(1.5))
            withAnimation(.spring(duration: 0.3)) { copied = false }
        }
    }
}
