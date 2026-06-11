import Darwin
import Foundation
import FluesterungKit

// flustr — whisper into your friends' notches.
// Thin client: talks to the running menu-bar app over its Unix control
// socket; the app owns the relay connections and the crypto.

func fail(_ message: String, code: Int32 = 1) -> Never {
    FileHandle.standardError.write(Data("flustr: \(message)\n".utf8))
    exit(code)
}

let usage = """
flustr — flüstere deinen Freunden in die Notch

  flustr <gruppe> <empfänger|all> <nachricht…>   Nachricht senden
  flustr groups                                  Gruppen & Mitglieder zeigen

Beispiele:
  flustr yolbe Jurij hey
  flustr yolbe all "Kaffee? Ich geh zum Tresen"
"""

let arguments = Array(CommandLine.arguments.dropFirst())

if arguments.isEmpty || ["-h", "--help", "help"].contains(arguments[0]) {
    print(usage)
    exit(arguments.isEmpty ? 64 : 0)
}

let request: ControlRequest
if arguments[0] == "groups" {
    request = ControlRequest(action: "groups")
} else {
    guard arguments.count >= 3 else {
        fail("usage: flustr <gruppe> <empfänger|all> <nachricht…>", code: 64)
    }
    request = ControlRequest(
        action: "send",
        group: arguments[0],
        to: arguments[1],
        text: arguments[2...].joined(separator: " ")
    )
}

// MARK: - Unix-domain-socket roundtrip

let socketPath = FluesterControl.socketURL.path
let fd = socket(AF_UNIX, SOCK_STREAM, 0)
guard fd >= 0 else { fail("Socket konnte nicht erstellt werden") }

var address = sockaddr_un()
address.sun_family = sa_family_t(AF_UNIX)
let pathBytes = socketPath.utf8CString
let capacity = MemoryLayout.size(ofValue: address.sun_path)
guard pathBytes.count <= capacity else { fail("Socket-Pfad zu lang: \(socketPath)") }
withUnsafeMutableBytes(of: &address.sun_path) { destination in
    pathBytes.withUnsafeBytes { source in
        destination.copyMemory(from: UnsafeRawBufferPointer(rebasing: source.prefix(destination.count)))
    }
}

let connected = withUnsafePointer(to: &address) { pointer in
    pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
    }
}
guard connected == 0 else {
    fail("Flüsterung-App läuft nicht — bitte zuerst starten (Socket: \(socketPath))")
}

var payload = try! JSONEncoder().encode(request)
payload.append(UInt8(ascii: "\n"))
let written = payload.withUnsafeBytes { write(fd, $0.baseAddress, $0.count) }
guard written == payload.count else { fail("Anfrage konnte nicht gesendet werden") }

var responseData = Data()
var chunk = [UInt8](repeating: 0, count: 64 * 1024)
while !responseData.contains(UInt8(ascii: "\n")) {
    let count = read(fd, &chunk, chunk.count)
    guard count > 0 else { break }
    responseData.append(contentsOf: chunk[0..<count])
}
close(fd)

let firstLine = Data(responseData.prefix(while: { $0 != UInt8(ascii: "\n") }))
guard let response = try? JSONDecoder().decode(ControlResponse.self, from: firstLine) else {
    fail("Keine gültige Antwort von der App")
}

guard response.ok else {
    fail(response.error ?? "Unbekannter Fehler")
}

if let groups = response.groups {
    if groups.isEmpty {
        print("Keine Gruppen — erstelle eine in der Flüsterung-App")
    }
    for group in groups {
        let status = group.connected ? "●" : "○"
        let members = group.members.isEmpty ? "niemand sonst online" : group.members.joined(separator: ", ")
        print("\(status) \(group.code)  —  \(members)")
    }
} else {
    print("geflüstert ✓")
}
