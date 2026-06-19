import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPipeServer } from "../src/transport.js"
import type { ControlResponse } from "../src/control.js"

// Runs the CLI as a subprocess against a fake app listening on a temporary
// Unix socket (MUNKEL_SOCKET overrides the default path).

// On Windows, `new URL(..., import.meta.url).pathname` returns
// "/C:/Users/.../src/munkel.ts" — a leading slash that Bun's subprocess
// resolver rejects with "Module not found". Strip it so the same test
// works on macOS, Linux and Windows.
const cliPath = new URL("../src/munkel.ts", import.meta.url).pathname.replace(/^\//, "")

let stopFakeApp: (() => void) | undefined
afterEach(() => {
  stopFakeApp?.()
  stopFakeApp = undefined
})

function fakeApp(respond: (request: unknown) => unknown) {
  const socketPath = join(tmpdir(), `munkel-test-${process.pid}-${Math.random().toString(36).slice(2)}.sock`)
  const requests: unknown[] = []
  const server = Bun.listen({
    unix: socketPath,
    socket: {
      data(socket, data) {
        const request = JSON.parse(data.toString())
        requests.push(request)
        socket.write(JSON.stringify(respond(request)) + "\n")
        socket.end()
      },
    },
  })
  stopFakeApp = () => server.stop(true)
  return { socketPath, requests }
}

function fakePipeApp(respond: (request: unknown) => ControlResponse) {
  // node:net's createServer({ path }) takes a Unix-domain-socket path on
  // macOS/Linux and a `\\.\pipe\<name>` path on Windows — the same
  // `createPipeServer` from apps/cli/src/transport.ts handles both. The
  // fake app thus exercises the CLI's named-pipe code path on every
  // platform (Bun listens on the same kind of path it then connects to).
  const pipePath = join(
    tmpdir(),
    `munkel-pipe-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
  )
  const requests: unknown[] = []
  let server: { close(): Promise<void> } | undefined
  let stopped = false
  // createPipeServer is async; the caller awaits the returned promise via
  // runMunkelPipe below. We track the requests in a closure and resolve
  // when the test ends.
  const pending = createPipeServer(pipePath, async (request) => {
    requests.push(request)
    return respond(request)
  }).then((s) => {
    server = s
    return { pipePath, requests }
  })
  stopFakeApp = () => {
    if (stopped) return
    stopped = true
    void server?.close()
  }
  return { pending, pipePath, requests }
}

async function runMunkel(args: string[], socketPath = "/nonexistent/control.sock") {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, MUNKEL_SOCKET: socketPath },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

async function runMunkelPipe(args: string[], pipePath: string) {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, MUNKEL_PIPE: pipePath },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

test("send delivers request and confirms", async () => {
  const app = fakeApp(() => ({ ok: true }))
  const result = await runMunkel(["blue-table-42", "Alex", "hey", "there"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("munkeled ✓")
  expect(app.requests).toEqual([
    { action: "send", group: "blue-table-42", to: "Alex", text: "hey there" },
  ])
})

test("circles lists members with connection status", async () => {
  const app = fakeApp(() => ({
    ok: true,
    groups: [
      { code: "blue-table-42", connected: true, members: ["Alex", "Sam"] },
      { code: "green-room-17", connected: false, members: [] },
    ],
  }))
  const result = await runMunkel(["circles"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("● blue-table-42  —  Alex, Sam")
  expect(result.stdout).toContain("○ green-room-17  —  no one else online")
  expect(app.requests).toEqual([{ action: "groups" }])
})

test("circles with no circles prints hint", async () => {
  const app = fakeApp(() => ({ ok: true, groups: [] }))
  const result = await runMunkel(["circles"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("No circles yet")
})

test("groups stays a back-compat alias for circles", async () => {
  const app = fakeApp(() => ({ ok: true, groups: [] }))
  const result = await runMunkel(["groups"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(app.requests).toEqual([{ action: "groups" }])
})

test("app error is reported on stderr", async () => {
  const app = fakeApp(() => ({ ok: false, error: "Unknown circle: nope" }))
  const result = await runMunkel(["nope", "all", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Unknown circle: nope")
})

test("invalid response is rejected", async () => {
  const app = fakeApp(() => undefined) // serializes to "undefined\n" — not JSON
  const result = await runMunkel(["blue-table-42", "all", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("No valid response")
})

test("custom socket with no app yields a helpful error (no auto-launch)", async () => {
  // A custom MUNKEL_SOCKET (set by runMunkel) is treated as "point at this
  // server"; the CLI must not try to spawn the installed app.
  const result = await runMunkel(["blue-table-42", "all", "hi"])

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Munkel app isn't running")
})

test("auto-launches the app when its socket is down", async () => {
  const socketPath = join(
    tmpdir(),
    `munkel-launch-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
  )
  // Stands in for `open -b dev.uq.munkel` / `munkel.exe`: backgrounds a fake
  // app that binds the socket a moment later, so the CLI exercises its launch
  // + wait + retry. The launcher detaches itself via Bun.spawn({detached:true})
  // so MUNKEL_LAUNCH_CMD returns immediately on every platform — POSIX `&` is
  // not portable to `cmd /c` on Windows.
  const launcher = join(
    tmpdir(),
    `munkel-launcher-${process.pid}-${Math.random().toString(36).slice(2)}.ts`,
  )
  await Bun.write(
    launcher,
    [
      "const child = Bun.spawn({",
      "  cmd: ['bun', process.argv[2], process.argv[3]],",
      "  stdout: 'ignore',",
      "  stderr: 'ignore',",
      "  detached: true,",
      "})",
      "child.unref()",
      // The fake-app body is the original launcher script; the child runs it
      // detached so the parent can return and the CLI's launch command exits.
      "const path = require('node:path')",
      "const fs = require('node:fs')",
      "const realLauncher = path.join(path.dirname(process.argv[2]), 'fake-app.ts')",
      // The first argv after this script is the launcher marker; replace it
      // with a fixed fake-app body the child runs directly. Simpler: write the
      // fake-app body into a sibling file and point the child at it.",
      "",
    ].join("\n"),
  )

  const fakeAppPath = join(
    tmpdir(),
    `munkel-fake-app-${process.pid}-${Math.random().toString(36).slice(2)}.ts`,
  )
  await Bun.write(
    fakeAppPath,
    [
      "const server = Bun.listen({",
      "  unix: process.argv[2],",
      "  socket: {",
      "    data(socket) {",
      '      socket.write(JSON.stringify({ ok: true, groups: [] }) + "\\n")',
      "      socket.end()",
      "    },",
      "  },",
      "})",
      "setTimeout(() => server.stop(true), 5000)",
    ].join("\n"),
  )
  // Replace the body we wrote above with one that spawns fakeAppPath detached.
  await Bun.write(
    launcher,
    [
      "const child = Bun.spawn({",
      "  cmd: ['bun', process.argv[2], process.argv[3]],",
      "  stdout: 'ignore',",
      "  stderr: 'ignore',",
      "  detached: true,",
      "})",
      "child.unref()",
    ].join("\n"),
  )

  const proc = Bun.spawn(["bun", cliPath, "circles"], {
    env: {
      ...process.env,
      MUNKEL_SOCKET: socketPath,
      MUNKEL_LAUNCH_CMD: `bun ${launcher} ${fakeAppPath} ${socketPath}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  expect(exitCode).toBe(0)
  expect(stderr).toContain("starting the Munkel app")
  expect(stdout).toContain("No circles yet")
})

test("no arguments prints usage with exit 64", async () => {
  const result = await runMunkel([])

  expect(result.exitCode).toBe(64)
  expect(result.stdout).toContain("munkel <circle> <recipient|all>")
})

test("--help prints usage with exit 0", async () => {
  const result = await runMunkel(["--help"])

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("munkel into your friends")
})

test("too few send arguments prints usage error", async () => {
  const result = await runMunkel(["blue-table-42", "Alex"])

  expect(result.exitCode).toBe(64)
  expect(result.stderr).toContain("usage: munkel")
})

test("dm sends a recipient-only request with no circle", async () => {
  const app = fakeApp(() => ({ ok: true }))
  const result = await runMunkel(["dm", "sebil", "deploy", "is", "green"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("munkeled ✓")
  expect(app.requests).toEqual([{ action: "send", to: "sebil", text: "deploy is green" }])
})

test("dm with no message is a usage error", async () => {
  const result = await runMunkel(["dm", "sebil"])

  expect(result.exitCode).toBe(64)
  expect(result.stderr).toContain("usage: munkel dm")
})

test("image sends a recipient-only request carrying the resolved file path", async () => {
  const app = fakeApp(() => ({ ok: true }))
  const imageFile = join(tmpdir(), `munkel-img-${process.pid}-${Math.random().toString(36).slice(2)}.png`)
  await Bun.write(imageFile, new Uint8Array([0x89, 0x50, 0x4e, 0x47])) // bytes irrelevant to the CLI
  const result = await runMunkel(["image", "sebil", imageFile], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("munkeled ✓")
  expect(app.requests).toEqual([{ action: "send", to: "sebil", imagePaths: [imageFile] }])
})

test("image sends multiple paths as an album", async () => {
  const app = fakeApp(() => ({ ok: true }))
  const a = join(tmpdir(), `munkel-img-${process.pid}-${Math.random().toString(36).slice(2)}.png`)
  const b = join(tmpdir(), `munkel-img-${process.pid}-${Math.random().toString(36).slice(2)}.png`)
  await Bun.write(a, new Uint8Array([1]))
  await Bun.write(b, new Uint8Array([2]))
  const result = await runMunkel(["image", "sebil", a, b], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(app.requests).toEqual([{ action: "send", to: "sebil", imagePaths: [a, b] }])
})

test("image with --caption attaches it as text", async () => {
  const app = fakeApp(() => ({ ok: true }))
  const imageFile = join(tmpdir(), `munkel-img-${process.pid}-${Math.random().toString(36).slice(2)}.png`)
  await Bun.write(imageFile, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
  const result = await runMunkel(["image", "sebil", imageFile, "--caption", "ship", "it"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(app.requests).toEqual([{ action: "send", to: "sebil", imagePaths: [imageFile], text: "ship it" }])
})

test("image with no path is a usage error", async () => {
  const result = await runMunkel(["image", "sebil"])

  expect(result.exitCode).toBe(64)
  expect(result.stderr).toContain("usage: munkel image")
})

test("image with a missing file exits 66 before touching the socket", async () => {
  const missing = join(tmpdir(), `munkel-missing-${process.pid}-${Math.random().toString(36).slice(2)}.png`)
  const result = await runMunkel(["image", "sebil", missing])

  expect(result.exitCode).toBe(66)
  expect(result.stderr).toContain("no such image file")
})

test("an error's candidate circles are printed to stderr", async () => {
  // An ambiguous `dm` recipient comes back with the candidate circles so the
  // single failed call is self-correcting — no follow-up `circles` needed.
  const app = fakeApp(() => ({
    ok: false,
    error: '"sebil" is in blue-table-42, green-room-17 — say `munkel <circle> sebil …`',
    groups: [
      { code: "blue-table-42", connected: true, members: ["Sebastian", "Sam"] },
      { code: "green-room-17", connected: true, members: ["Sebil"] },
    ],
  }))
  const result = await runMunkel(["dm", "sebil", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("is in blue-table-42")
  expect(result.stderr).toContain("● blue-table-42")
  expect(result.stderr).toContain("● green-room-17")
})

test("circles --json emits machine-readable output", async () => {
  const groups = [
    { code: "blue-table-42", connected: true, members: ["Alex", "Sam"] },
    { code: "green-room-17", connected: false, members: [] },
  ]
  const app = fakeApp(() => ({ ok: true, groups }))
  const result = await runMunkel(["circles", "--json"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(groups)
  expect(app.requests).toEqual([{ action: "groups" }])
})

test("a silent app triggers a bounded response timeout", async () => {
  // The app accepts the connection but never replies; the CLI must not hang
  // the caller (and any agent turn driving it) indefinitely.
  const socketPath = join(
    tmpdir(),
    `munkel-silent-${process.pid}-${Math.random().toString(36).slice(2)}.sock`,
  )
  const server = Bun.listen({
    unix: socketPath,
    socket: { data() { /* swallow the request, never respond */ } },
  })
  try {
    const proc = Bun.spawn(["bun", cliPath, "circles"], {
      env: { ...process.env, MUNKEL_SOCKET: socketPath, MUNKEL_RESPONSE_TIMEOUT_MS: "200" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(exitCode).toBe(75)
    expect(stderr).toContain("never replied")
  } finally {
    server.stop(true)
  }
})

// MUNKEL_PIPE exercises the Windows named-pipe code path. The fake app
// uses `createPipeServer` (node:net), which on macOS/Linux binds a
// Unix-domain-socket path and on Windows binds a named pipe. The CLI's
// pipe client uses `createPipeClient` from the same module, so the
// round-trip is the production code path on every platform.
test("circles over MUNKEL_PIPE works the same as the Unix socket", async () => {
  const app = await fakePipeApp(() => ({
    ok: true,
    groups: [
      { code: "blue-table-42", connected: true, members: ["Alex", "Sam"] },
      { code: "kaffee", connected: false, members: [] },
    ],
  })).pending

  const result = await runMunkelPipe(["circles"], app.pipePath)
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("● blue-table-42  —  Alex, Sam")
  expect(result.stdout).toContain("○ kaffee  —  no one else online")
  expect(app.requests).toEqual([{ action: "groups" }])
})

test("send over MUNKEL_PIPE delivers the request as JSON", async () => {
  const app = await fakePipeApp(() => ({ ok: true })).pending

  const result = await runMunkelPipe(
    ["blue-table-42", "Alex", "deploy", "is", "green"],
    app.pipePath,
  )
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("munkeled ✓")
  expect(app.requests).toEqual([
    { action: "send", group: "blue-table-42", to: "Alex", text: "deploy is green" },
  ])
})

test("dm over MUNKEL_PIPE resolves across circles (recipient-only)", async () => {
  const app = await fakePipeApp(() => ({ ok: true })).pending

  const result = await runMunkelPipe(["dm", "sebil", "hi"], app.pipePath)
  expect(result.exitCode).toBe(0)
  expect(app.requests).toEqual([{ action: "send", to: "sebil", text: "hi" }])
})

test("image over MUNKEL_PIPE carries the resolved path", async () => {
  const app = await fakePipeApp(() => ({ ok: true })).pending

  const imageFile = join(
    tmpdir(),
    `munkel-pipe-img-${process.pid}-${Math.random().toString(36).slice(2)}.png`,
  )
  await Bun.write(imageFile, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))

  const result = await runMunkelPipe(["image", "sebil", imageFile], app.pipePath)
  expect(result.exitCode).toBe(0)
  expect(app.requests).toEqual([{ action: "send", to: "sebil", imagePaths: [imageFile] }])
})

test("MUNKEL_PIPE with no app yields the same no-launch error as MUNKEL_SOCKET", async () => {
  // Explicit MUNKEL_PIPE must NOT auto-launch: the user pointed at a
  // specific pipe and there is no app there. The CLI must surface a
  // clear error and exit 1 — never spawn a new app.
  const result = await runMunkelPipe(["circles"], "/nonexistent/control.pipe")

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Munkel app isn't running")
})
