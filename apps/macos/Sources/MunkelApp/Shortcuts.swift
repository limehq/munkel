import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    /// Open the quick-send palette from anywhere. Default ⌥M, user-rebindable
    /// in the menu Recorder.
    static let togglePalette = Self(
        "togglePalette",
        initial: .init(.m, modifiers: [.option])
    )

    /// Copy the hovered history row or current message. Enabled only while the
    /// notch is hovered and no reply is open.
    static let copyHoveredHistory = Self(
        "copyHoveredHistory",
        initial: .init(.c)
    )
}
