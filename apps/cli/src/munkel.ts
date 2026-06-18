#!/usr/bin/env bun
// munkel — munkel into your friends' notches.
// Thin client: talks to the running menu-bar app over its Unix control
// socket; the app owns the relay connections and the crypto.

import { homedir } from "node:os"
import { basename, join } from "node:path"

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

// `MUNKEL_DEV=1` (or a binary named `munkel-dev`) targets the parallel "Munkel
// Dev" app instead of the installed release — its own control socket and bundle
// id. Mirrors apps/macos (make-bundle.sh / ControlProtocol). The dev build does
// not embed the CLI, so in development run it from source:
//   MUNKEL_DEV=1 bun apps/cli/src/munkel.ts <args>
const devMode =
  process.env.MUNKEL_DEV === "1" || basename(process.execPath).startsWith("munkel-dev")

const socketPath =
  process.env.MUNKEL_SOCKET ??
  join(homedir(), "Library", "Application Support", devMode ? "Munkel Dev" : "Munkel", "control.sock")

function fail(message: string, code = 1): never {
  console.error(`munkel: ${message}`)
  process.exit(code)
}

// Mirrors MessageLimits.maxCharacters in the macOS app.
const MAX_MESSAGE_CHARS = 2048

// Everything after the recipient is one message joined with spaces; quoting is
// only needed for shell metacharacters.
function joinMessage(parts: string[]): string {
  const text = parts.join(" ")
  if (text.length > MAX_MESSAGE_CHARS) {
    fail(`message too long (${text.length} > ${MAX_MESSAGE_CHARS} characters)`, 64)
  }
  return text
}

function formatGroup(group: ControlGroupInfo): string {
  const status = group.connected ? "●" : "○"
  const members = group.members.length === 0 ? "no one else online" : group.members.join(", ")
  return `${status} ${group.code}  —  ${members}`
}

// Stamped at compile time by build-release.sh via `bun build --define`;
// dev runs (bun src/munkel.ts) fall back to the placeholder.
declare const MUNKEL_BUILD_VERSION: string
const version = typeof MUNKEL_BUILD_VERSION === "string" ? MUNKEL_BUILD_VERSION : "0.0.0-dev"

const usage = `munkel — munkel into your friends' notches

  munkel dm <recipient> <message…>                Notify one person (resolved across circles)
  munkel <circle> <recipient|all> <message…>      Send within a circle, or broadcast with 'all'
  munkel circles [--json]                         Show your circles & members

Examples:
  munkel dm sebil "deploy is green"
  munkel blue-table-42 Alex hey
  munkel blue-table-42 all "coffee?"

Exit codes: 0 ok · 64 usage · 75 app didn't reply · 1 other failure
MUNKEL_SOCKET overrides the control socket; MUNKEL_DEV=1 targets the dev app.`

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
let jsonOutput = false
// `circles` is the documented command; `groups` stays as a back-compat
// alias. The wire action remains "groups" (see ControlProtocol.swift).
if (args[0] === "circles" || args[0] === "groups") {
  request = { action: "groups" }
  jsonOutput = args.includes("--json")
} else if (args[0] === "dm") {
  // `munkel dm <recipient> <message…>` — recipient-only send. The app
  // resolves the name across every circle, so an agent can notify someone in
  // a single call without first listing circles.
  if (args.length < 3) {
    fail("usage: munkel dm <recipient> <message…>", 64)
  }
  request = { action: "send", to: args[1], text: joinMessage(args.slice(2)) }
} else {
  // `munkel <circle> <recipient|all> <message…>` — circle-scoped send;
  // required for broadcasts and to disambiguate a name across circles.
  if (args.length < 3) {
    fail("usage: munkel <circle> <recipient|all> <message…>", 64)
  }
  request = {
    action: "send",
    group: args[0],
    to: args[1],
    text: joinMessage(args.slice(2)),
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
  const bundleId = devMode ? "dev.uq.munkel.debug" : "dev.uq.munkel"
  const command = override ? ["sh", "-c", override] : ["open", "-g", "-b", bundleId]
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

// Bound the wait for a reply. `firstLine` only settles on a newline, EOF or
// socket error, so an app that accepts the connection but never answers would
// otherwise hang the caller — and any agent turn driving it — indefinitely.
// MUNKEL_RESPONSE_TIMEOUT_MS lets the tests shrink the bound.
const parsedTimeout = Number(process.env.MUNKEL_RESPONSE_TIMEOUT_MS)
const responseTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 4000
let responseTimer: ReturnType<typeof setTimeout> | undefined
const responseTimeout = new Promise<never>((_, reject) => {
  responseTimer = setTimeout(() => reject(new Error("timeout")), responseTimeoutMs)
})

let response: ControlResponse
try {
  response = JSON.parse(await Promise.race([firstLine, responseTimeout]))
} catch (error) {
  socket.end()
  if (error instanceof Error && error.message === "timeout") {
    // EX_TEMPFAIL (75): app is up but didn't answer in time; a retry may work.
    fail("the Munkel app accepted the connection but never replied — it may be busy; try again", 75)
  }
  fail("No valid response from the app")
} finally {
  clearTimeout(responseTimer)
}
socket.end()

if (!response.ok) {
  // An error can carry the candidate circles (e.g. an ambiguous `dm`
  // recipient) so a single failed call is self-correcting — surface them.
  for (const group of response.groups ?? []) {
    console.error(`  ${formatGroup(group)}`)
  }
  fail(response.error ?? "Unknown error")
}

if (jsonOutput) {
  console.log(JSON.stringify(response.groups ?? []))
  process.exit(0)
}

if (response.groups) {
  if (response.groups.length === 0) {
    console.log("No circles yet — create one in the Munkel app")
  }
  for (const group of response.groups) {
    console.log(formatGroup(group))
  }
} else {
  console.log("munkeled ✓")
}
process.exit(0)
