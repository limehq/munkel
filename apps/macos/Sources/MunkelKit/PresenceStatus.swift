import Foundation

public enum PresenceStatus: String, Codable, Sendable, CaseIterable {
    case online
    case doNotDisturb = "dnd"
    case away

    public var suppressesNotchPreview: Bool {
        self != .online
    }
}
