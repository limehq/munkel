import Foundation

/// Generates human-readable group codes like `nebel-quarz-42`.
/// ~21 bits of spoken-word entropy is fine: the unguessable part is the
/// derived 128-bit groupId; the code only needs to be easy to say out loud.
enum GroupCode {
    private static let words = [
        "kaffee", "falke", "tiger", "luchs", "espresso", "matcha",
        "nebel", "fluss", "anker", "komet", "pinie", "quarz",
        "salbei", "tundra", "vulkan", "wal", "zeder", "ahorn",
        "biber", "dachs", "eule", "fichte", "gecko", "hummel",
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
