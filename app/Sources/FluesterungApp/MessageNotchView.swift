import AppKit
import SwiftUI

/// The full (hover-expanded) view: avatar, sender, text. Copying lives in
/// the persistent strip button; clicking the message opens the inline
/// reply field (see MessageNotchContainer/NotchPresenter).
struct MessageNotchView: View {
    let message: IncomingMessage

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(name: message.sender, imageData: message.avatarData)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(message.sender)
                        .font(.system(size: 11, weight: .semibold))
                    // Globe: everyone saw this. Lock: only you did.
                    Image(systemName: message.isDirect ? "lock.fill" : "globe")
                        .font(.system(size: 9))
                        .help(message.isDirect ? "Privat an dich" : "An alle")
                    Text("·")
                    // Which circle it came from: stable color for
                    // at-a-glance recognition, name for certainty.
                    Circle()
                        .fill(message.groupColor)
                        .frame(width: 6, height: 6)
                    Text(message.group)
                        .font(.system(size: 10, design: .monospaced))
                        .lineLimit(1)
                }
                .foregroundStyle(.white.opacity(0.55))
                Text(message.text)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white)
                    .lineLimit(6)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 12)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

}
