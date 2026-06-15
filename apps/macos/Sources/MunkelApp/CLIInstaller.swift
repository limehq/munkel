import AppKit
import Foundation

/// Installs the `munkel` command line tool that ships inside the app bundle.
///
/// The CLI is a companion to the app — it talks to the running menu-bar app over
/// a Unix domain socket and is useless on its own — so it lives at
/// `Munkel.app/Contents/Resources/munkel` rather than as a standalone download.
/// Homebrew symlinks it onto PATH automatically (the cask `binary` stanza);
/// everyone who grabbed the DMG opts in here.
enum CLIInstaller {
    /// Standard Unix bin that's on the default macOS PATH. Writing there needs
    /// admin, so installation goes through one authorization prompt.
    private static let symlink = "/usr/local/bin/munkel"

    /// The CLI binary embedded in this app bundle, if present.
    static var embeddedBinary: URL? {
        Bundle.main.url(forResource: "munkel", withExtension: nil)
    }

    /// True when the symlink already resolves to this bundle's embedded CLI
    /// (e.g. a Homebrew install, or a previous run of this installer).
    static var isInstalled: Bool {
        guard let embedded = embeddedBinary,
              let target = try? FileManager.default.destinationOfSymbolicLink(atPath: symlink)
        else { return false }
        let resolved = (target as NSString).isAbsolutePath
            ? target
            : (symlink as NSString).deletingLastPathComponent + "/" + target
        return URL(fileURLWithPath: resolved).resolvingSymlinksInPath()
            == embedded.resolvingSymlinksInPath()
    }

    /// Menu entry point: explain the situation, then symlink the embedded CLI
    /// onto PATH with a single administrator prompt.
    @MainActor
    static func installFromMenu() {
        NSApp.activate(ignoringOtherApps: true)

        guard let source = embeddedBinary else {
            alert(style: .warning,
                  title: "Command line tool unavailable",
                  message: "The munkel command is missing from this app bundle. "
                      + "Reinstall Munkel and try again.")
            return
        }

        if isInstalled {
            alert(style: .informational,
                  title: "Command line tool already installed",
                  message: "Run munkel in your terminal. The Munkel app must be "
                      + "running for commands to go through.")
            return
        }

        // Hand the path to AppleScript as a string literal (escape only the
        // characters AppleScript cares about), then let `quoted form of` build
        // the shell-safe argument — this avoids brittle nested shell quoting.
        let appleEscaped = source.path
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        let script = """
        set src to "\(appleEscaped)"
        do shell script "mkdir -p /usr/local/bin && ln -sf " & quoted form of src & \
        " /usr/local/bin/munkel" with administrator privileges
        """

        var errorInfo: NSDictionary?
        NSAppleScript(source: script)?.executeAndReturnError(&errorInfo)

        if let errorInfo {
            // -128 is "user cancelled the auth dialog" — leave silently.
            if (errorInfo[NSAppleScript.errorNumber] as? Int) == -128 { return }
            alert(style: .warning,
                  title: "Couldn't install the command",
                  message: (errorInfo[NSAppleScript.errorMessage] as? String)
                      ?? "Installing /usr/local/bin/munkel failed.")
            return
        }

        alert(style: .informational,
              title: "Command line tool installed",
              message: "Run munkel in a new terminal session. The Munkel app "
                  + "must be running for commands to go through.")
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
