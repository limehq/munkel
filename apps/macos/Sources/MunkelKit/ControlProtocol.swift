import Foundation

/// Contract between the menu-bar app (Unix-domain-socket server) and the
/// `munkel` CLI: newline-delimited JSON, one request/response per connection.
public enum MunkelControl {
    /// `~/Library/Application Support/Munkel/control.sock` — or `Munkel Dev` for
    /// the debug build (bundle id `….debug`), so a dev build and an installed
    /// release don't fight over one socket. Mirrored by apps/cli (`munkel-dev`).
    public static var socketURL: URL {
        let appName = (Bundle.main.bundleIdentifier?.hasSuffix(".debug") ?? false)
            ? "Munkel Dev" : "Munkel"
        let directory = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(appName, isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("control.sock")
    }
}

public struct ControlRequest: Codable, Sendable {
    public var action: String
    public var group: String?
    public var to: String?
    public var text: String?
    /// Absolute paths to image files to send as one album. The app reads,
    /// encodes, seals and uploads them — bytes never cross the socket or argv.
    public var imagePaths: [String]?

    public init(action: String, group: String? = nil, to: String? = nil, text: String? = nil, imagePaths: [String]? = nil) {
        self.action = action
        self.group = group
        self.to = to
        self.text = text
        self.imagePaths = imagePaths
    }
}

public struct ControlGroupInfo: Codable, Sendable {
    public var code: String
    public var connected: Bool
    public var members: [String]

    public init(code: String, connected: Bool, members: [String]) {
        self.code = code
        self.connected = connected
        self.members = members
    }
}

public struct ControlResponse: Codable, Sendable {
    public var ok: Bool
    public var error: String?
    public var groups: [ControlGroupInfo]?

    public init(ok: Bool, error: String? = nil, groups: [ControlGroupInfo]? = nil) {
        self.ok = ok
        self.error = error
        self.groups = groups
    }
}
