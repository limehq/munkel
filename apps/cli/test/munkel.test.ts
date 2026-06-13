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
