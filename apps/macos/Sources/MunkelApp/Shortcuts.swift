import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    /// Opens the quick-send command palette from anywhere. Default ⌃⌘M:
    /// two modifiers avoid the "greedy single-modifier" trap, ⌘M alone is
    /// Minimize, and ⌥ would clash with character entry (µ). User-rebindable
    /// via the Recorder in the menu.
    static let togglePalette = Self(
        "togglePalette",
        initial: .init(.m, modifiers: [.control, .command])
    )
}
