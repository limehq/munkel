import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    /// Opens the quick-send command palette from anywhere. Default ⌥M: a quick
    /// one-hand reach for the app's primary action. It shadows ⌥M's µ character
    /// entry, an accepted trade-off for the convenience; user-rebindable via the
    /// Recorder in the menu for anyone who needs µ.
    static let togglePalette = Self(
        "togglePalette",
        initial: .init(.m, modifiers: [.option])
    )

    /// Copy the message under the pointer (a hovered history row, or the
    /// current message). A bare "C", no modifiers — only safe because
    /// NotchPresenter keeps it disabled and enables it ONLY while the notch is
    /// hovered and no reply is open, so it never swallows a "C" typed elsewhere.
    /// Not user-rebindable: it's a contextual hover affordance.
    static let copyHoveredHistory = Self(
        "copyHoveredHistory",
        initial: .init(.c)
    )
}
