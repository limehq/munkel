import MunkelKit
import SwiftUI

extension PresenceStatus {
    var dotColor: Color {
        switch self {
        case .online: .green
        case .doNotDisturb: .orange
        case .away: .red
        }
    }

    var menuLabel: String {
        switch self {
        case .online: "Online"
        case .doNotDisturb: "Do Not Disturb"
        case .away: "Away"
        }
    }

    var symbolName: String {
        switch self {
        case .online: "circle.fill"
        case .doNotDisturb: "moon.fill"
        case .away: "clock.fill"
        }
    }
}
