#!/usr/bin/env bun
// munkel — munkel into your friends' notches.
// Thin client: talks to the running tray/menu-bar app over its control
// channel (Unix-domain socket on macOS, named pipe on Windows); the app
// owns the relay connections and the crypto.

import { homedir } from "node:os"
import { basename, join, resolve as resolvePath } from "node:path"
import { buildPipeName, type ControlGroupInfo, type ControlRequest, type ControlResponse } from "./control.js"
import { createPipeClient, type PipeClient } from "./transport.js"

// `MUNKEL_DEV=1` (or a binary named `munkel-dev`) targets the parallel "Munkel
// Dev" app instead of the installed release — its own control socket and bundle
// id. Mirrors apps/macos (make-bundle.sh / ControlProtocol). The dev build does
// not embed the CLI, so in development run it from source:
//   MUNKEL_DEV=1 bun apps/cli/src/munkel.ts <args>
const devMode =
  process.env.MUNKEL_DEV === "1" || basename(process.execPath).startsWith("munkel-dev")

// MARK: - Transport selection
//
// Platform default: a Unix-domain socket at the macOS-app standard
// location. On Windows the system-tray app binds a named pipe
// (`\\.\pipe\Munkel-<user>-Control`) — see apps/windows/src/main/main.ts.
// Explicit env vars override either direction: MUNKEL_SOCKET forces the
// Unix path (used by the existing tests on every platform) and
// MUNKEL_PIPE forces the named-pipe path (used by the new Windows
// integration tests and as a manual override on macOS/Linux).
const isWindows = process.platform === "win32"
const explicitPipe = process.env.MUNKEL_PIPE
const explicitSocket = process.env.MUNKEL_SOCKET
// MUNKEL_SOCKET wins on every platform so the Unix-path tests are
// reproducible; MUNKEL_PIPE forces the pipe path even on macOS/Linux.
const usePipe = explicitSocket === undefined && (explicitPipe !== undefined || isWindows)
const pipePath = explicitPipe ?? (isWindows ? buildPipeName() : null)
const socketPath = usePipe
  ? null
  : (process.env.MUNKEL_SOCKET ??
    join(
      homedir(),
      "Library",
      "Application Support",
      devMode ? "Munkel Dev" : "Munkel",
      "control.sock",
    ))
const transportAddress: string = (usePipe ? pipePath : socketPath) as string

function fail(message: string, code = 1): never {
  console.error(`munkel: ${message}`)
  process.exit(code)
}

// Mirrors MessageLimits.maxCharacters in the macOS app.
const MAX_MESSAGE_CHARS = 2048

// Supported image formats for the `munkel image` command. Kept in sync with
// the Windows image codec (apps/windows/src/core/image-codec.ts) and the
// macOS app. Extensions are compared case-insensitively.
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".heic", ".heif"]

// Mirrors the album limit enforced by the receivers.
const MAX_IMAGES = 8

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
  munkel image <recipient> <path…> [--caption <t>] Send image(s) (optional shared caption)
  munkel <circle> <recipient|all> <message…>      Send within a circle, or broadcast with 'all'
  munkel circles [--json]                         Show your circles & members

Examples:
  munkel dm sebil "deploy is green"
  munkel image sebil ~/Desktop/a.png ~/Desktop/b.png --caption "two shots"
  munkel blue-table-42 Alex hey
  munkel blue-table-42 all "coffee?"

Exit codes: 0 ok · 64 usage · 66 no such file · 75 app didn't reply · 1 other failure
MUNKEL_SOCKET overrides the Unix control socket (macOS).
MUNKEL_PIPE   overrides the named-pipe address (Windows).
MUNKEL_DEV=1  targets the dev app.
MUNKEL_LAUNCH_CMD overrides the launch command (used by tests).
MUNKEL_EXE    overrides the Windows .exe path to start the app.`

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
} else if (args[0] === "image") {
  // `munkel image <recipient> <path…> [--caption <text>]` — recipient-only
  // image send (dm-style). One or more paths (quote any with spaces) form an
  // album; an optional `--caption` adds a shared message. Paths are resolved to
  // absolute because the app reads them from a different working directory;
  // only the paths + caption travel the socket, never the bytes.
  const usageImage = "usage: munkel image <recipient> <path…> [--caption <text>]"
  if (args.length < 3) {
    fail(usageImage, 64)
  }
  const rest = args.slice(2)
  let caption: string | undefined
  const rawPaths: string[] = []
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--caption" || rest[i] === "-c") {
      caption = rest.slice(i + 1).join(" ")
      break
    }
    rawPaths.push(rest[i])
  }
  if (rawPaths.length === 0) {
    fail(usageImage, 64)
  }
  if (rawPaths.length > MAX_IMAGES) {
    fail(`too many images (${rawPaths.length} > ${MAX_IMAGES})`, 64)
  }
  const imagePaths: string[] = []
  for (const raw of rawPaths) {
    const dot = raw.lastIndexOf(".")
    const ext = dot === -1 ? "" : raw.slice(dot).toLowerCase()
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      fail(
        `unsupported image format: ${ext || "(none)"} — supported: ${SUPPORTED_IMAGE_EXTENSIONS.join(", ")}`,
        64,
      )
    }
    const abs = resolvePath(raw)
    if (!(await Bun.file(abs).exists())) {
      fail(`no such image file: ${abs}`, 66) // EX_NOINPUT
    }
    imagePaths.push(abs)
  }
  request = { action: "send", to: args[1], imagePaths, ...(caption ? { text: caption } : {}) }
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

// MARK: - Roundtrip

// Bound the wait for a reply. The transport either returns a parsed
// response or rejects; we layer a wall-clock bound on top so a silently
// broken app can't hang the caller (and any agent turn driving it).
// MUNKEL_RESPONSE_TIMEOUT_MS lets the tests shrink the bound.
const parsedTimeout = Number(process.env.MUNKEL_RESPONSE_TIMEOUT_MS)
const responseTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 4000

function responseTimeout(): Promise<never> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), responseTimeoutMs)
    // The promise rejects first; the timeout is cleared by JSON.parse settling
    // before the next tick in the common case. The clearTimeout here is a
    // best-effort — the resolved promise is GC'd either way.
    void t.unref?.()
  })
}

// Named-pipe roundtrip. Mirrors the Windows app's
// apps/windows/src/main/main.ts createControlServer call: one
// request/response per connection, newline-delimited JSON. The pipe
// client in `transport.ts` handles the framing; we only wrap it so the
// call site can `await` it.
async function sendOverPipe(path: string, req: ControlRequest): Promise<ControlResponse> {
  let client: PipeClient | null = null
  try {
    client = await createPipeClient(path)
    return await Promise.race([client.request(req), responseTimeout()])
  } finally {
    await client?.close()
  }
}

// Unix-domain-socket roundtrip. Mirrors the macOS app's ControlServer
// (apps/macos/Sources/MunkelApp/ControlServer.swift): one request/response
// per connection, newline-delimited JSON. The firstLine promise is
// resolved either by a newline, EOF or socket error — whichever comes
// first; JSON.parse then decides if the result is usable.
const { promise: firstLine, resolve: resolveFirstLine } = Promise.withResolvers<string>()
let received = ""

function feed(text: string) {
  received += text
  const newline = received.indexOf("\n")
  if (newline !== -1) {
    resolveFirstLine(received.slice(0, newline))
  }
}

function connectUnixSocket() {
  return Bun.connect({
    unix: socketPath as string,
    socket: {
      data(_socket, data) {
        feed(data.toString())
      },
      close() {
        resolveFirstLine(received) // EOF without newline — let JSON parsing decide
      },
      error() {
        resolveFirstLine(received)
      },
    },
  }).catch(() => null)
}

// MARK: - Connect (with auto-launch when the address is the default)

// Open the transport once, write the request, read the response, close.
// Returns `null` when the transport isn't reachable (so the caller can
// decide whether to auto-launch and retry).
async function openAndSend(req: ControlRequest): Promise<ControlResponse | null> {
  if (usePipe) {
    try {
      return await sendOverPipe(pipePath as string, req)
    } catch (err) {
      if (err instanceof Error && err.message === "timeout") throw err
      return null
    }
  }
  const socket = await connectUnixSocket()
  if (!socket) return null
  socket.write(JSON.stringify(req) + "\n")
  return JSON.parse(await Promise.race([firstLine, responseTimeout()]))
}

// Ask the OS to launch the menu-bar / tray app. The macOS path uses
// `open -g -b <bundleId>` (background, no focus steal). The Windows path
// prefers `MUNKEL_EXE` and falls back to `munkel.exe` on PATH — the
// installer is expected to register either. MUNKEL_LAUNCH_CMD overrides
// the command on either platform (used by the tests to stand up a fake
// app).
async function launchApp(): Promise<void> {
  const override = process.env.MUNKEL_LAUNCH_CMD
  let command: string[]
  if (override) {
    // `sh -c` on POSIX, `cmd /c` on Windows. The override string is
    // shell-evaluated so tests can background a long-running fake app.
    if (isWindows) {
      command = ["cmd", "/c", override]
    } else {
      command = ["sh", "-c", override]
    }
  } else if (isWindows) {
    const exe = process.env.MUNKEL_EXE ?? "munkel.exe"
    command = [exe]
  } else {
    const bundleId = devMode ? "dev.uq.munkel.debug" : "dev.uq.munkel"
    command = ["open", "-g", "-b", bundleId]
  }
  const proc = Bun.spawn(command, { stdout: "ignore", stderr: "pipe" })
  if ((await proc.exited) !== 0) {
    const detail = (await new Response(proc.stderr).text()).trim()
    const installHint = isWindows
      ? " — install it from the Munkel release page or set MUNKEL_EXE"
      : " — install it with: brew install limehq/tap/munkel"
    fail(`couldn't start the Munkel app${detail ? ` (${detail})` : ""}${installHint}`)
  }
}

// A custom address points at a specific server we shouldn't try to
// spawn; only auto-launch the installed app on the default path (the
// tests opt back in by setting MUNKEL_LAUNCH_CMD).
function shouldAutoLaunch(): boolean {
  if (usePipe) {
    return process.env.MUNKEL_PIPE === undefined || process.env.MUNKEL_LAUNCH_CMD !== undefined
  }
  return process.env.MUNKEL_SOCKET === undefined || process.env.MUNKEL_LAUNCH_CMD !== undefined
}

// Poll until the transport is reachable or we give up. Re-initialises
// the line-buffer state because the firstLine promise is one-shot.
async function waitForTransport(timeoutMs = 8000, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (usePipe) {
      try {
        const client = await createPipeClient(pipePath as string)
        await client.close()
        return true
      } catch {
        // not reachable yet
      }
    } else if (await connectUnixSocket()) {
      return true
    }
    if (Date.now() >= deadline) return false
    await Bun.sleep(intervalMs)
  }
}

let response: ControlResponse | null = null
try {
  response = await openAndSend(request)
} catch (error) {
  if (error instanceof Error && error.message === "timeout") {
    // EX_TEMPFAIL (75): app is up but didn't answer in time; a retry may work.
    fail("the Munkel app accepted the connection but never replied — it may be busy; try again", 75)
  }
  fail("No valid response from the app")
}
if (!response) {
  if (!shouldAutoLaunch()) {
    fail(`Munkel app isn't running — start it first (${usePipe ? "pipe" : "socket"}: ${transportAddress})`)
  }
  console.error("munkel: starting the Munkel app…")
  await launchApp()
  if (!(await waitForTransport())) {
    fail(`started the Munkel app but its ${usePipe ? "control pipe" : "control socket"} never came up`)
  }
  // Reset the line buffer so the second connection's data is read fresh.
  received = ""
  try {
    response = await openAndSend(request)
  } catch (error) {
    if (error instanceof Error && error.message === "timeout") {
      fail("the Munkel app accepted the connection but never replied — it may be busy; try again", 75)
    }
    fail("No valid response from the app")
  }
}
if (!response) {
  fail("No valid response from the app")
}

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
