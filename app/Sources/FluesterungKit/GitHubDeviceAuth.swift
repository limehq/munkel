import Foundation

/// GitHub OAuth device flow — the only officially secretless flow: just a
/// client ID, no callback, no server. The token is used once for the profile
/// fetch and then discarded; nothing account-like is ever stored.
public struct GitHubDeviceCodeGrant: Sendable, Equatable {
    public let deviceCode: String
    public let userCode: String
    public let verificationURI: URL
    public let expiresAt: Date
    public let interval: TimeInterval

    public init(
        deviceCode: String,
        userCode: String,
        verificationURI: URL,
        expiresAt: Date,
        interval: TimeInterval
    ) {
        self.deviceCode = deviceCode
        self.userCode = userCode
        self.verificationURI = verificationURI
        self.expiresAt = expiresAt
        self.interval = interval
    }
}

public struct GitHubUser: Sendable, Equatable {
    public let login: String
    public let name: String?
    public let avatarURL: URL?

    public init(login: String, name: String?, avatarURL: URL?) {
        self.login = login
        self.name = name
        self.avatarURL = avatarURL
    }
}

public enum GitHubAuthError: Error, Equatable {
    /// "Enable Device Flow" is not ticked in the OAuth app settings.
    case deviceFlowDisabled
    /// The 15-minute device-code window elapsed.
    case expired
    /// The user cancelled on github.com.
    case accessDenied
    case http(Int)
    case malformedResponse
}

public struct GitHubDeviceAuth: Sendable {
    public typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    public typealias Sleep = @Sendable (TimeInterval) async throws -> Void

    private let clientID: String
    private let transport: Transport
    private let sleep: Sleep
    private let now: @Sendable () -> Date

    /// Ephemeral on purpose: URLSession.shared's URLCache may write the
    /// bearer-authorized /user response to disk — this keeps every GitHub
    /// exchange RAM-only, preserving "the token is never persisted".
    private static let session = URLSession(configuration: .ephemeral)

    public init(
        clientID: String,
        transport: Transport? = nil,
        sleep: @escaping Sleep = { try await Task.sleep(for: .seconds($0)) },
        now: @escaping @Sendable () -> Date = Date.init
    ) {
        self.clientID = clientID
        self.transport = transport ?? { try await Self.session.data(for: $0) }
        self.sleep = sleep
        self.now = now
    }

    public func requestDeviceCode() async throws -> GitHubDeviceCodeGrant {
        let response = try await postForm(
            to: URL(string: "https://github.com/login/device/code")!,
            fields: ["client_id": clientID]
        )
        try Self.throwOnError(response)
        guard
            let deviceCode = response["device_code"] as? String,
            let userCode = response["user_code"] as? String,
            let verificationURI = (response["verification_uri"] as? String).flatMap(URL.init(string:)),
            let expiresIn = response["expires_in"] as? TimeInterval,
            let interval = response["interval"] as? TimeInterval
        else {
            throw GitHubAuthError.malformedResponse
        }
        return GitHubDeviceCodeGrant(
            deviceCode: deviceCode,
            userCode: userCode,
            verificationURI: verificationURI,
            expiresAt: now().addingTimeInterval(expiresIn),
            interval: interval
        )
    }

    /// Polls until the user authorizes on github.com. Cancellation propagates
    /// out of the injected sleep, so callers can abort cleanly.
    public func pollForAccessToken(_ grant: GitHubDeviceCodeGrant) async throws -> String {
        var interval = max(grant.interval, 1)
        while true {
            try await sleep(interval)
            guard now() < grant.expiresAt else { throw GitHubAuthError.expired }

            let response = try await postForm(
                to: URL(string: "https://github.com/login/oauth/access_token")!,
                fields: [
                    "client_id": clientID,
                    "device_code": grant.deviceCode,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                ]
            )
            if let token = response["access_token"] as? String {
                return token
            }
            switch response["error"] as? String {
            case "authorization_pending":
                continue
            case "slow_down":
                interval = (response["interval"] as? TimeInterval) ?? (interval + 5)
            case "expired_token":
                throw GitHubAuthError.expired
            case "access_denied":
                throw GitHubAuthError.accessDenied
            case "device_flow_disabled":
                throw GitHubAuthError.deviceFlowDisabled
            default:
                throw GitHubAuthError.malformedResponse
            }
        }
    }

    public func fetchUser(token: String) async throws -> GitHubUser {
        var request = URLRequest(url: URL(string: "https://api.github.com/user")!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue("fluesterung", forHTTPHeaderField: "User-Agent")

        let json = try await send(request)
        guard let login = json["login"] as? String else {
            throw GitHubAuthError.malformedResponse
        }
        return GitHubUser(
            login: login,
            name: json["name"] as? String,
            avatarURL: (json["avatar_url"] as? String).flatMap(URL.init(string:))
        )
    }

    /// Raw avatar bytes, requested at the given pixel size. The size goes in
    /// as an extra query item — avatar URLs already carry `?v=4`.
    public func fetchAvatar(from url: URL, pixelSize: Int) async throws -> Data {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw GitHubAuthError.malformedResponse
        }
        components.queryItems = (components.queryItems ?? [])
            + [URLQueryItem(name: "s", value: String(pixelSize))]
        guard let sizedURL = components.url else { throw GitHubAuthError.malformedResponse }

        var request = URLRequest(url: sizedURL)
        request.setValue("fluesterung", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await transport(request)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw GitHubAuthError.http(http.statusCode)
        }
        return data
    }

    // MARK: - Internals

    private func postForm(to url: URL, fields: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("fluesterung", forHTTPHeaderField: "User-Agent")
        request.httpBody = Self.formEncode(fields).data(using: .utf8)
        return try await send(request)
    }

    private func send(_ request: URLRequest) async throws -> [String: Any] {
        let (data, response) = try await transport(request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw GitHubAuthError.http(http.statusCode)
        }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw GitHubAuthError.malformedResponse
        }
        return json
    }

    /// GitHub answers some failures as HTTP 200 with an `error` field.
    private static func throwOnError(_ response: [String: Any]) throws {
        switch response["error"] as? String {
        case nil:
            return
        case "device_flow_disabled":
            throw GitHubAuthError.deviceFlowDisabled
        default:
            throw GitHubAuthError.malformedResponse
        }
    }

    private static func formEncode(_ fields: [String: String]) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return fields
            .sorted { $0.key < $1.key }
            .map { key, value in
                let encoded = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
                return "\(key)=\(encoded)"
            }
            .joined(separator: "&")
    }
}
