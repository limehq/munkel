import Foundation

public enum RelayError: Error {
    case notConnected
}

/// WebSocket connection to one group's Durable Object. Auto-reconnects with
/// exponential backoff and keeps the connection alive with protocol pings.
/// Consume `events` to react to presence and incoming messages.
public actor RelayClient {
    public enum Event: Sendable {
        case received(ServerMessage)
        case disconnected
    }

    public nonisolated let events: AsyncStream<Event>

    private let url: URL
    private let continuation: AsyncStream<Event>.Continuation
    private var socket: URLSessionWebSocketTask?
    private var runTask: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?
    private var isClosed = false

    public init(relayURL: URL, groupId: String, memberId: String) {
        var components = URLComponents(
            url: relayURL.appending(path: "ws"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "group", value: groupId),
            URLQueryItem(name: "member", value: memberId),
        ]
        self.url = components.url!
        (self.events, self.continuation) = AsyncStream.makeStream(of: Event.self)
    }

    public func start() {
        guard runTask == nil, !isClosed else { return }
        runTask = Task { await self.runLoop() }
    }

    public func send(_ message: ClientMessage) async throws {
        guard let socket else { throw RelayError.notConnected }
        let data = try JSONEncoder().encode(message)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }

    public func close() {
        isClosed = true
        pingTask?.cancel()
        runTask?.cancel()
        socket?.cancel(with: .normalClosure, reason: nil)
        socket = nil
        continuation.finish()
    }

    private func runLoop() async {
        var backoffSeconds = 1
        while !isClosed, !Task.isCancelled {
            let socket = URLSession.shared.webSocketTask(with: url)
            self.socket = socket
            socket.resume()
            startPingLoop(socket)

            do {
                while true {
                    let raw = try await socket.receive()
                    backoffSeconds = 1
                    guard case let .string(text) = raw else { continue }
                    guard let message = try? JSONDecoder().decode(ServerMessage.self, from: Data(text.utf8)) else {
                        continue
                    }
                    continuation.yield(.received(message))
                }
            } catch {
                pingTask?.cancel()
                self.socket = nil
                if !isClosed {
                    continuation.yield(.disconnected)
                }
            }

            guard !isClosed, !Task.isCancelled else { break }
            try? await Task.sleep(for: .seconds(backoffSeconds))
            backoffSeconds = min(backoffSeconds * 2, 30)
        }
    }

    private func startPingLoop(_ socket: URLSessionWebSocketTask) {
        pingTask?.cancel()
        pingTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(30))
                guard !Task.isCancelled else { return }
                try? await socket.send(.string(#"{"type":"ping"}"#))
            }
        }
    }
}
