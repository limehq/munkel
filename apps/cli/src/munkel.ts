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
  const text = args.slice(2).join(" ")
  // Mirrors MessageLimits.maxCharacters in the macOS app.
  const MAX_MESSAGE_CHARS = 2048
  if (text.length > MAX_MESSAGE_CHARS) {
    fail(`message too long (${text.length} > ${MAX_MESSAGE_CHARS} characters)`, 64)
  }
  request = {
    action: "send",
    group: args[0],
    to: args[1],
    text,
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

function connectOnce() {
  return Bun.connect({
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
  }).catch(() => null)
}

// Ask macOS to launch the menu-bar app. `open -g` brings it up in the
// background without stealing focus from the terminal; the bundle id is
// stamped by make-bundle.sh. MUNKEL_LAUNCH_CMD overrides the command (used
// by the tests to stand up a fake app).
async function launchApp(): Promise<void> {
  const override = process.env.MUNKEL_LAUNCH_CMD
  const command = override ? ["sh", "-c", override] : ["open", "-g", "-b", "dev.uq.munkel"]
  const proc = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" })
  if ((await proc.exited) !== 0) {
    const detail = (await new Response(proc.stderr).text()).trim()
    fail(
      `couldn't start the Munkel app${detail ? ` (${detail})` : ""} — ` +
        `install it with: brew install limehq/tap/munkel`,
    )
  }
}

// The app's control socket binds in AppModel.init(), so it appears shortly
// after launch — poll until it's reachable or we give up.
async function waitForSocket(timeoutMs = 8000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const socket = await connectOnce()
    if (socket) return socket
    if (Date.now() >= deadline) return null
    await Bun.sleep(intervalMs)
  }
}

let socket = await connectOnce()
if (!socket) {
  // A custom MUNKEL_SOCKET points at a specific server we shouldn't try to
  // spawn; only auto-launch the installed app on the default path (the
  // tests opt back in by setting MUNKEL_LAUNCH_CMD).
  const autoLaunch =
    process.env.MUNKEL_SOCKET === undefined || process.env.MUNKEL_LAUNCH_CMD !== undefined
  if (!autoLaunch) {
    fail(`Munkel app isn't running — start it first (socket: ${socketPath})`)
  }
  console.error("munkel: starting the Munkel app…")
  await launchApp()
  socket = await waitForSocket()
  if (!socket) {
    fail("started the Munkel app but its control socket never came up")
  }
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
