#!/usr/bin/env bun
// munkel — whisper into your friends' notches.
// Thin client: talks to the running menu-bar app over its Unix control
// socket; the app owns the relay connections and the crypto.

import { homedir } from "node:os"
import { join } from "node:path"

// Mirrors MunkelKit/ControlProtocol.swift: newline-delimited JSON,
// one request/response per connection.
interface ControlRequest {
  action: string
  group?: string
  to?: string
  text?: string
}

interface ControlGroupInfo {
  code: string
  connected: boolean
  members: string[]
}

interface ControlResponse {
  ok: boolean
  error?: string
  groups?: ControlGroupInfo[]
}

const socketPath =
  process.env.MUNKEL_SOCKET ??
  join(homedir(), "Library", "Application Support", "Munkel", "control.sock")

function fail(message: string, code = 1): never {
  console.error(`munkel: ${message}`)
  process.exit(code)
}

// Stamped at compile time by build-release.sh via `bun build --define`;
// dev runs (bun src/munkel.ts) fall back to the placeholder.
declare const MUNKEL_BUILD_VERSION: string
const version = typeof MUNKEL_BUILD_VERSION === "string" ? MUNKEL_BUILD_VERSION : "0.0.0-dev"

const usage = `munkel — flüstere deinen Freunden in die Notch

  munkel <gruppe> <empfänger|all> <nachricht…>   Nachricht senden
  munkel groups                                  Gruppen & Mitglieder zeigen

Beispiele:
  munkel blue-table-42 Alex hey
  munkel blue-table-42 all "coffee?"`

const args = process.argv.slice(2)

if (args.length === 0 || ["-h", "--help", "help"].includes(args[0])) {
  console.log(usage)
  process.exit(args.length === 0 ? 64 : 0)
}

if (["-v", "--version", "version"].includes(args[0])) {
  console.log(version)
  process.exit(0)
}

let request: ControlRequest
if (args[0] === "groups") {
  request = { action: "groups" }
} else {
  if (args.length < 3) {
    fail("usage: munkel <gruppe> <empfänger|all> <nachricht…>", 64)
  }
  request = {
    action: "send",
    group: args[0],
    to: args[1],
    text: args.slice(2).join(" "),
  }
}

// MARK: - Unix-domain-socket roundtrip

const { promise: firstLine, resolve } = Promise.withResolvers<string>()
let received = ""

function feed(text: string) {
  received += text
  const newline = received.indexOf("\n")
  if (newline !== -1) {
    resolve(received.slice(0, newline))
  }
}

let socket
try {
  socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data(_socket, data) {
        feed(data.toString())
      },
      close() {
        resolve(received) // EOF without newline — let JSON parsing decide
      },
      error() {
        resolve(received)
      },
    },
  })
} catch {
  fail(`Munkel-App läuft nicht — bitte zuerst starten (Socket: ${socketPath})`)
}

socket.write(JSON.stringify(request) + "\n")

let response: ControlResponse
try {
  response = JSON.parse(await firstLine)
} catch {
  fail("Keine gültige Antwort von der App")
}
socket.end()

if (!response.ok) {
  fail(response.error ?? "Unbekannter Fehler")
}

if (response.groups) {
  if (response.groups.length === 0) {
    console.log("Keine Gruppen — erstelle eine in der Munkel-App")
  }
  for (const group of response.groups) {
    const status = group.connected ? "●" : "○"
    const members =
      group.members.length === 0 ? "niemand sonst online" : group.members.join(", ")
    console.log(`${status} ${group.code}  —  ${members}`)
  }
} else {
  console.log("geflüstert ✓")
}
process.exit(0)
