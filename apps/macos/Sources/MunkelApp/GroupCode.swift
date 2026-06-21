import Foundation

/// Generates human-readable group codes like `coffee-falcon-42`.
/// ~21 bits of spoken-word entropy is fine: the unguessable part is the
/// derived 128-bit groupId; the code only needs to be easy to say out loud.
enum GroupCode {
    private static let words = [
        "coffee", "falcon", "tiger", "lynx", "espresso", "matcha",
        "mist", "river", "anchor", "comet", "pine", "quartz",
        "sage", "tundra", "volcano", "whale", "cedar", "maple",
        "beaver", "badger", "owl", "spruce", "gecko", "bumblebee",
    ]

    static func generate() -> String {
        let first = words.randomElement()!
        var second = words.randomElement()!
        while second == first {
            second = words.randomElement()!
        }
        let number = Int.random(in: 10...99)
        return "\(first)-\(second)-\(number)"
    }
}
