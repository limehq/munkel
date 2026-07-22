import AppKit
import MunkelKit
import SwiftUI

/// Sender avatar: the profile image when one arrived, otherwise initials on
/// a gradient derived deterministically from the name, so every sender keeps
/// a stable color across messages and launches.
struct AvatarView: View {
    let name: String
    var imageData: Data?
    var size: CGFloat = 34
    var status: PresenceStatus? = nil
    var statusRingColor: Color = Color(nsColor: .windowBackgroundColor)

    private static let palettes: [[Color]] = [
        [Color(red: 0.96, green: 0.42, blue: 0.42), Color(red: 0.85, green: 0.19, blue: 0.41)],
        [Color(red: 0.36, green: 0.65, blue: 0.98), Color(red: 0.22, green: 0.34, blue: 0.92)],
        [Color(red: 0.40, green: 0.85, blue: 0.62), Color(red: 0.10, green: 0.58, blue: 0.46)],
        [Color(red: 0.98, green: 0.72, blue: 0.31), Color(red: 0.92, green: 0.42, blue: 0.18)],
        [Color(red: 0.75, green: 0.52, blue: 0.98), Color(red: 0.48, green: 0.25, blue: 0.88)],
        [Color(red: 0.34, green: 0.84, blue: 0.86), Color(red: 0.16, green: 0.50, blue: 0.72)],
    ]

    var body: some View {
        ZStack {
            // Peer-controlled bytes: AvatarCodec decodes via a pixel-capped
            // ImageIO thumbnail, so declared-huge images can't balloon memory.
            if let cgImage = imageData.flatMap({ AvatarCodec.decodeImage($0) }) {
                Image(nsImage: NSImage(cgImage: cgImage, size: NSSize(width: size, height: size)))
                    .resizable()
                    .scaledToFill()
            } else {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: palette,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Text(initials)
                    .font(.system(size: size * 0.38, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(alignment: .bottomTrailing) {
            if let status {
                let dot = max(7, size * 0.34)
                Circle()
                    .fill(status.dotColor)
                    .frame(width: dot, height: dot)
                    .overlay(Circle().strokeBorder(statusRingColor, lineWidth: dot * 0.2))
            }
        }
    }

    private var initials: String {
        let words = name.split(separator: " ").prefix(2)
        let letters = words.compactMap { $0.first.map(String.init) }
        return letters.joined().uppercased()
    }

    private var palette: [Color] {
        Self.palette(for: name)
    }

    /// Stable per-sender colors, shared with effects like the pulse ring.
    static func palette(for name: String) -> [Color] {
        // FNV-1a: stable across launches, unlike Hasher-based hashValue
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in name.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01B3
        }
        return palettes[Int(hash % UInt64(palettes.count))]
    }
}
