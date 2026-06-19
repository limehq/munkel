import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Runs the CLI as a subprocess against a fake app listening on a temporary
// Unix socket (MUNKEL_SOCKET overrides the default path).

const cliPath = new URL("../src/munkel.ts", import.meta.url).pathname

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
  // Stands in for `open -b dev.uq.munkel`: backgrounds a fake app that binds
  // the socket a moment later, so the CLI exercises its launch + wait + retry.
  const launcher = join(
    tmpdir(),
    `munkel-launcher-${process.pid}-${Math.random().toString(36).slice(2)}.ts`,
  )
  await Bun.write(
    launcher,
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

  const proc = Bun.spawn(["bun", cliPath, "circles"], {
    env: {
      ...process.env,
      MUNKEL_SOCKET: socketPath,
      MUNKEL_LAUNCH_CMD: `bun ${launcher} ${socketPath} &`,
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
