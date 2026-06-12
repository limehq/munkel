import AppKit
import SwiftUI

/// The full (hover-expanded) view: avatar, sender, text. Copying lives in
/// the persistent strip button (see MessageNotchContainer). Deliberately
/// read-only — no reply affordance, per product decision.
struct MessageNotchView: View {
    let message: IncomingMessage

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(name: message.sender, imageData: message.avatarData)

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
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

}
