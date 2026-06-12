import Foundation
import Testing
@testable import FluesterungKit

/// Scripted transport: returns canned JSON bodies in order and records every
/// request; the sleep stub records intervals instead of waiting.
private final class TransportScript: @unchecked Sendable {
    private let lock = NSLock()
    private var responses: [(status: Int, body: String)]
    private(set) var requests: [URLRequest] = []
    private(set) var sleeps: [TimeInterval] = []

    init(_ responses: [(status: Int, body: String)]) {
        self.responses = responses
    }

    func transport(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let next = try nextResponse(for: request)
        let response = HTTPURLResponse(
            url: request.url!, statusCode: next.status, httpVersion: nil, headerFields: nil
        )!
        return (Data(next.body.utf8), response)
    }

    func sleep(_ seconds: TimeInterval) async throws {
        lock.withLock { sleeps.append(seconds) }
    }

    private func nextResponse(for request: URLRequest) throws -> (status: Int, body: String) {
        try lock.withLock {
            requests.append(request)
            guard !responses.isEmpty else { throw GitHubAuthError.malformedResponse }
            return responses.removeFirst()
        }
    }
}

private func auth(
    _ script: TransportScript,
    now: @escaping @Sendable () -> Date = { Date(timeIntervalSince1970: 0) }
) -> GitHubDeviceAuth {
    GitHubDeviceAuth(
        clientID: "test-client-id",
        transport: script.transport,
        sleep: script.sleep,
        now: now
    )
}

private let grantJSON = """
    {"device_code":"dc123","user_code":"WDJB-MJHT",\
    "verification_uri":"https://github.com/login/device",\
    "expires_in":900,"interval":5}
    """

@Suite("GitHub device flow")
struct GitHubDeviceAuthTests {
    @Test func requestDeviceCodeParsesGrant() async throws {
        let script = TransportScript([(200, grantJSON)])
        let grant = try await auth(script).requestDeviceCode()

        #expect(grant.deviceCode == "dc123")
        #expect(grant.userCode == "WDJB-MJHT")
        #expect(grant.verificationURI == URL(string: "https://github.com/login/device"))
        #expect(grant.expiresAt == Date(timeIntervalSince1970: 900))
        #expect(grant.interval == 5)

        let request = script.requests[0]
        #expect(request.url?.absoluteString == "https://github.com/login/device/code")
        #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
        let body = String(data: request.httpBody ?? Data(), encoding: .utf8)
        #expect(body == "client_id=test-client-id")
    }

    @Test func requestDeviceCodeMapsDeviceFlowDisabled() async {
        let script = TransportScript([(200, #"{"error":"device_flow_disabled"}"#)])
        await #expect(throws: GitHubAuthError.deviceFlowDisabled) {
            try await auth(script).requestDeviceCode()
        }
    }

    @Test func pollSucceedsAfterPendingThenSlowDown() async throws {
        let script = TransportScript([
            (200, #"{"error":"authorization_pending"}"#),
            (200, #"{"error":"slow_down","interval":10}"#),
            (200, #"{"access_token":"gho_abc","token_type":"bearer","scope":""}"#),
        ])
        let grant = GitHubDeviceCodeGrant(
            deviceCode: "dc123",
            userCode: "WDJB-MJHT",
            verificationURI: URL(string: "https://github.com/login/device")!,
            expiresAt: Date(timeIntervalSince1970: 900),
            interval: 5
        )
        let token = try await auth(script).pollForAccessToken(grant)

        #expect(token == "gho_abc")
        // slow_down's interval applies to every later wait.
        #expect(script.sleeps == [5, 5, 10])
        let body = String(data: script.requests[0].httpBody ?? Data(), encoding: .utf8) ?? ""
        #expect(body.contains("device_code=dc123"))
        #expect(body.contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"))
    }

    @Test func pollThrowsExpiredFromServer() async {
        let script = TransportScript([(200, #"{"error":"expired_token"}"#)])
        let grant = GitHubDeviceCodeGrant(
            deviceCode: "dc",
            userCode: "u",
            verificationURI: URL(string: "https://github.com/login/device")!,
            expiresAt: Date(timeIntervalSince1970: 900),
            interval: 5
        )
        await #expect(throws: GitHubAuthError.expired) {
            try await auth(script).pollForAccessToken(grant)
        }
    }

    @Test func pollThrowsExpiredOnceDeadlinePasses() async {
        let script = TransportScript([])
        let grant = GitHubDeviceCodeGrant(
            deviceCode: "dc",
            userCode: "u",
            verificationURI: URL(string: "https://github.com/login/device")!,
            expiresAt: Date(timeIntervalSince1970: 10),
            interval: 5
        )
        // Clock already past the deadline — no request must go out.
        await #expect(throws: GitHubAuthError.expired) {
            try await auth(script, now: { Date(timeIntervalSince1970: 11) })
                .pollForAccessToken(grant)
        }
        #expect(script.requests.isEmpty)
    }

    @Test func pollThrowsAccessDenied() async {
        let script = TransportScript([(200, #"{"error":"access_denied"}"#)])
        let grant = GitHubDeviceCodeGrant(
            deviceCode: "dc",
            userCode: "u",
            verificationURI: URL(string: "https://github.com/login/device")!,
            expiresAt: Date(timeIntervalSince1970: 900),
            interval: 5
        )
        await #expect(throws: GitHubAuthError.accessDenied) {
            try await auth(script).pollForAccessToken(grant)
        }
    }

    @Test func fetchUserParsesProfileAndSendsHeaders() async throws {
        let script = TransportScript([
            (200, #"{"login":"octocat","name":"The Octocat","avatar_url":"https://avatars.githubusercontent.com/u/583231?v=4"}"#)
        ])
        let user = try await auth(script).fetchUser(token: "gho_abc")

        #expect(user.login == "octocat")
        #expect(user.name == "The Octocat")
        #expect(user.avatarURL?.absoluteString == "https://avatars.githubusercontent.com/u/583231?v=4")

        let request = script.requests[0]
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer gho_abc")
        #expect(request.value(forHTTPHeaderField: "User-Agent") == "fluesterung")
    }

    @Test func fetchUserAcceptsNullName() async throws {
        let script = TransportScript([
            (200, #"{"login":"octocat","name":null,"avatar_url":"https://avatars.githubusercontent.com/u/583231?v=4"}"#)
        ])
        let user = try await auth(script).fetchUser(token: "gho_abc")
        #expect(user.name == nil)
    }

    @Test func fetchAvatarAppendsSizeToExistingQuery() async throws {
        let script = TransportScript([(200, "binary")])
        let url = URL(string: "https://avatars.githubusercontent.com/u/583231?v=4")!
        _ = try await auth(script).fetchAvatar(from: url, pixelSize: 128)
        #expect(
            script.requests[0].url?.absoluteString
                == "https://avatars.githubusercontent.com/u/583231?v=4&s=128"
        )
    }

    @Test func fetchAvatarThrowsOnHTTPError() async {
        let script = TransportScript([(404, "missing")])
        let url = URL(string: "https://avatars.githubusercontent.com/u/0")!
        await #expect(throws: GitHubAuthError.http(404)) {
            _ = try await auth(script).fetchAvatar(from: url, pixelSize: 128)
        }
    }
}
