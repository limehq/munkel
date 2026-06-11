import Foundation

/// Contract between the menu-bar app (Unix-domain-socket server) and the
/// `flustr` CLI: newline-delimited JSON, one request/response per connection.
public enum FluesterControl {
    /// `~/Library/Application Support/Fluesterung/control.sock`
    public static var socketURL: URL {
        let directory = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Fluesterung", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("control.sock")
    }
}

public struct ControlRequest: Codable, Sendable {
    public var action: String
    public var group: String?
    public var to: String?
    public var text: String?

    public init(action: String, group: String? = nil, to: String? = nil, text: String? = nil) {
        self.action = action
        self.group = group
        self.to = to
        self.text = text
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
