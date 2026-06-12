import Foundation

struct IncomingMessage: Equatable {
    let sender: String
    let avatarData: Data?
    let text: String
    /// True for a private message (sent only to us), false for a broadcast.
    let isDirect: Bool
}
