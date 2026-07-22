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
    private static let commandName = "munkel"

    static var embeddedBinary: URL? {
        Bundle.main.url(forResource: "munkel", withExtension: nil)
    }

    private static var candidates: [URL] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return [
            URL(fileURLWithPath: "/opt/homebrew/bin"),
            URL(fileURLWithPath: "/usr/local/bin"),
            home.appending(path: ".local/bin"),
        ]
    }

    private static var homePath: String {
        FileManager.default.homeDirectoryForCurrentUser.path
    }

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

    private static func displayPath(_ url: URL) -> String {
        url.path.hasPrefix(homePath + "/")
            ? "~" + url.path.dropFirst(homePath.count)
            : url.path
    }

    private static func addToShellPath(_ dir: URL) -> URL? {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? ""
        let profile = shell.hasSuffix("/bash")
            ? home.appending(path: ".bash_profile")
            : home.appending(path: ".zshrc")
        let fragment = dir.path.replacingOccurrences(of: home.path, with: "")
        let existing = (try? String(contentsOf: profile, encoding: .utf8)) ?? ""
        guard !existing.contains(fragment) else { return nil }
        let lead = existing.isEmpty ? "" : (existing.hasSuffix("\n") ? "\n" : "\n\n")
        let block = lead + "# Added by Munkel for the munkel CLI\nexport PATH=\"$HOME\(fragment):$PATH\"\n"
        guard let data = (existing + block).data(using: .utf8) else { return nil }
        try? data.write(to: profile, options: .atomic)
        return profile
    }

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
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.createSymbolicLink(at: dest, withDestinationURL: source)
        } catch {
            alert(style: .warning,
                  title: "Couldn't install the command",
                  message: "Linking \(dest.path) failed: \(error.localizedDescription)")
            return
        }

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
