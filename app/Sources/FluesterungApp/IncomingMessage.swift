import Foundation

struct IncomingMessage: Equatable {
    let sender: String
    let avatarData: Data?
    let text: String
}
