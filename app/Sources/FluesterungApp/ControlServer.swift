import Foundation
import FluesterungKit
import Network

/// Unix-domain-socket server inside the app, serving the `flustr` CLI.
/// The app holds the relay connections; the CLI is a thin client.
@MainActor
final class ControlServer {
    private weak var model: AppModel?
    private var listener: NWListener?

    init(model: AppModel) {
        self.model = model
    }

    func start() {
        let path = FluesterControl.socketURL.path
        // Stale socket file from a previous run blocks the bind.
        try? FileManager.default.removeItem(atPath: path)
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = NWEndpoint.unix(path: path)
            parameters.allowLocalEndpointReuse = true
            let listener = try NWListener(using: parameters)
            listener.newConnectionHandler = { [weak self] connection in
                Task { @MainActor in
                    self?.serve(connection)
                }
            }
            listener.start(queue: .main)
            self.listener = listener
        } catch {
            NSLog("fluesterung: control socket failed to start: \(error)")
        }
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: .main)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            Task { @MainActor in
                guard let self else {
                    connection.cancel()
                    return
                }
                var buffer = buffer
                if let data {
                    buffer.append(data)
                }
                if let newline = buffer.firstIndex(of: UInt8(ascii: "\n")) {
                    await self.respond(on: connection, requestData: buffer.prefix(upTo: newline))
                } else if isComplete || error != nil {
                    if buffer.isEmpty {
                        connection.cancel()
                    } else {
                        await self.respond(on: connection, requestData: buffer)
                    }
                } else {
                    self.receive(on: connection, buffer: buffer)
                }
            }
        }
    }

    private func respond(on connection: NWConnection, requestData: Data) async {
        let response: ControlResponse
        if let model, let request = try? JSONDecoder().decode(ControlRequest.self, from: Data(requestData)) {
            response = await model.handleControl(request)
        } else {
            response = ControlResponse(ok: false, error: "Ungültige Anfrage")
        }
        var payload = (try? JSONEncoder().encode(response)) ?? Data(#"{"ok":false}"#.utf8)
        payload.append(UInt8(ascii: "\n"))
        connection.send(content: payload, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
}
