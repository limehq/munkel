import Foundation

/// Shared message-size limits. The 2048-character cap applies symmetrically:
/// outgoing text is clamped before sending and incoming text is clamped before
/// display, so neither a local typo nor a peer can produce an oversized message.
/// (Well under the protocol's 48 KiB payload ceiling — see `protocol.ts`.)
/// The `munkel` CLI mirrors this value in `apps/cli/src/munkel.ts`.
enum MessageLimits {
    static let maxCharacters = 2048

    static func clamp(_ text: String) -> String {
        text.count > maxCharacters ? String(text.prefix(maxCharacters)) : text
    }
}
