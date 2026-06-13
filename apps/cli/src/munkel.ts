#!/usr/bin/env bun
// munkel — munkel into your friends' notches.
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

const usage = `munkel — munkel into your friends' notches

  munkel <circle> <recipient|all> <message…>      Send a message
  munkel circles                                 Show your circles & members

Examples:
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
// `circles` is the documented command; `groups` stays as a back-compat
// alias. The wire action remains "groups" (see ControlProtocol.swift).
if (args[0] === "circles" || args[0] === "groups") {
  request = { action: "groups" }
} else {
  if (args.length < 3) {
    fail("usage: munkel <circle> <recipient|all> <message…>", 64)
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
  fail(`Munkel app isn't running — start it first (socket: ${socketPath})`)
}

socket.write(JSON.stringify(request) + "\n")

let response: ControlResponse
try {
  response = JSON.parse(await firstLine)
} catch {
  fail("No valid response from the app")
}
socket.end()

if (!response.ok) {
  fail(response.error ?? "Unknown error")
}

if (response.groups) {
  if (response.groups.length === 0) {
    console.log("No circles yet — create one in the Munkel app")
  }
  for (const group of response.groups) {
    const status = group.connected ? "●" : "○"
    const members =
      group.members.length === 0 ? "no one else online" : group.members.join(", ")
    console.log(`${status} ${group.code}  —  ${members}`)
  }
} else {
  console.log("munkeled ✓")
}
process.exit(0)
