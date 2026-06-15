import AppKit
import Foundation

/// Installs the `munkel` command line tool that ships inside the app bundle.
///
/// The CLI is a companion to the app — it talks to the running menu-bar app over
/// a Unix domain socket and is useless on its own — so it lives at
/// `…/Contents/Resources/munkel` rather than as a standalone download. Homebrew
/// symlinks it onto PATH automatically (the cask `binary` stanza); DMG users opt
/// in from the menu. We link into the first *user-writable* directory on PATH,
/// so installing never needs an administrator password.
enum CLIInstaller {
    /// The command name on PATH. Only the release build offers this (the menu
    /// item is hidden in DEBUG, which doesn't embed the CLI).
    private static let commandName = "munkel"

    /// The CLI binary embedded in this app bundle, if present.
    static var embeddedBinary: URL? {
        Bundle.main.url(forResource: "munkel", withExtension: nil)
    }

    /// Install targets in priority order. The Homebrew bins and `/usr/local/bin`
    /// are on the default macOS PATH; `~/.local/bin` is the no-Homebrew fallback
    /// (the user may need to add it to PATH). The first user-writable one wins —
    /// so we link with plain FileManager and never prompt for admin.
    private static var candidates: [URL] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return [
            URL(fileURLWithPath: "/opt/homebrew/bin"),  // Apple Silicon Homebrew
            URL(fileURLWithPath: "/usr/local/bin"),      // Intel Homebrew / default PATH
            home.appending(path: ".local/bin"),          // user fallback (no Homebrew)
        ]
    }

    private static var homePath: String {
        FileManager.default.homeDirectoryForCurrentUser.path
    }

    /// The first candidate we can create a symlink in without admin, creating a
    /// home-owned `bin` directory (e.g. `~/.local/bin`) on the way if needed.
    private static func writableTarget() -> URL? {
        let fm = FileManager.default
        for dir in candidates {
            if dir.path.hasPrefix(homePath) {
                try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            }
            if fm.fileExists(atPath: dir.path), fm.isWritableFile(atPath: dir.path) {
                return dir
            }
        }
        return nil
    }

    /// Abbreviate the home directory to `~` for display in alerts.
    private static func displayPath(_ url: URL) -> String {
        url.path.hasPrefix(homePath + "/")
            ? "~" + url.path.dropFirst(homePath.count)
            : url.path
    }

    /// Add `dir` to PATH in the user's shell profile (no admin) so future shells
    /// find the command. Only used for the `~/.local/bin` fallback, which isn't
    /// on the default macOS PATH. Idempotent; returns the profile it edited, or
    /// nil if the directory was already referenced there.
    private static func addToShellPath(_ dir: URL) -> URL? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? ""
        let profile = shell.hasSuffix("/bash")
            ? home.appending(path: ".bash_profile")
            : home.appending(path: ".zshrc")  // macOS default shell
        let fragment = dir.path.replacingOccurrences(of: home.path, with: "")  // "/.local/bin"
        let existing = (try? String(contentsOf: profile, encoding: .utf8)) ?? ""
        guard !existing.contains(fragment) else { return nil }
        let lead = existing.isEmpty ? "" : (existing.hasSuffix("\n") ? "\n" : "\n\n")
        let block = lead + "# Added by Munkel for the munkel CLI\nexport PATH=\"$HOME\(fragment):$PATH\"\n"
        guard let data = (existing + block).data(using: .utf8) else { return nil }
        try? data.write(to: profile, options: .atomic)
        return profile
    }

    /// True when one of the candidate dirs already links our command to this
    /// bundle's embedded CLI (a Homebrew install, or a previous run here).
    static var isInstalled: Bool {
        guard let embedded = embeddedBinary?.resolvingSymlinksInPath() else { return false }
        let fm = FileManager.default
        for dir in candidates {
            let link = dir.appending(path: commandName)
            guard let target = try? fm.destinationOfSymbolicLink(atPath: link.path) else { continue }
            let resolved = (target as NSString).isAbsolutePath
                ? URL(fileURLWithPath: target)
                : dir.appending(path: target)
            if resolved.resolvingSymlinksInPath() == embedded { return true }
        }
        return false
    }

    /// Menu entry point: symlink the embedded CLI onto PATH, no admin prompt.
    @MainActor
    static func installFromMenu() {
        NSApp.activate(ignoringOtherApps: true)

        guard let source = embeddedBinary else {
            alert(style: .warning,
                  title: "Command line tool unavailable",
                  message: "The \(commandName) command is missing from this app bundle. "
                      + "Reinstall the app and try again.")
            return
        }

        if isInstalled {
            alert(style: .informational,
                  title: "Command line tool already installed",
                  message: "Run \(commandName) in your terminal. The app must be "
                      + "running for commands to go through.")
            return
        }

        guard let dir = writableTarget() else {
            alert(style: .warning,
                  title: "Couldn't install the command",
                  message: "No writable directory on your PATH was found. Create "
                      + "~/.local/bin, add it to your PATH, then try again.")
            return
        }

        let dest = dir.appending(path: commandName)
        do {
            try? FileManager.default.removeItem(at: dest)  // replace a stale link
            try FileManager.default.createSymbolicLink(at: dest, withDestinationURL: source)
        } catch {
            alert(style: .warning,
                  title: "Couldn't install the command",
                  message: "Linking \(dest.path) failed: \(error.localizedDescription)")
            return
        }

        // Homebrew and /usr/local/bin are already on PATH; for the home fallback
        // we add the directory to the shell profile so it works after a restart.
        var pathNote = ""
        if dir.path.hasPrefix(homePath) {
            if let profile = addToShellPath(dir) {
                pathNote = "\n\nAdded \(displayPath(dir)) to your PATH in "
                    + "\(displayPath(profile)) — open a new terminal for it to take effect."
            } else {
                pathNote = "\n\n\(displayPath(dir)) is already on your PATH."
            }
        }
        alert(style: .informational,
              title: "Command line tool installed",
              message: "Linked \(displayPath(dest)). Run \(commandName) in a new terminal "
                  + "session; the app must be running for commands to go through." + pathNote)
    }

    @MainActor
    private static func alert(style: NSAlert.Style, title: String, message: String) {
        let panel = NSAlert()
        panel.alertStyle = style
        panel.messageText = title
        panel.informativeText = message
        panel.addButton(withTitle: "OK")
        panel.runModal()
    }
}
