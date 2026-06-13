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
  const result = await runMunkel(["yolbe", "Jurij", "hey", "du"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("geflüstert ✓")
  expect(app.requests).toEqual([
    { action: "send", group: "yolbe", to: "Jurij", text: "hey du" },
  ])
})

test("groups lists members with connection status", async () => {
  const app = fakeApp(() => ({
    ok: true,
    groups: [
      { code: "yolbe", connected: true, members: ["Anna", "Ben"] },
      { code: "kaffee-falke-42", connected: false, members: [] },
    ],
  }))
  const result = await runMunkel(["groups"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("● yolbe  —  Anna, Ben")
  expect(result.stdout).toContain("○ kaffee-falke-42  —  niemand sonst online")
  expect(app.requests).toEqual([{ action: "groups" }])
})

test("groups with no groups prints hint", async () => {
  const app = fakeApp(() => ({ ok: true, groups: [] }))
  const result = await runMunkel(["groups"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("Keine Gruppen")
})

test("app error is reported on stderr", async () => {
  const app = fakeApp(() => ({ ok: false, error: "Unbekannte Gruppe: nope" }))
  const result = await runMunkel(["nope", "all", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Unbekannte Gruppe: nope")
})

test("invalid response is rejected", async () => {
  const app = fakeApp(() => undefined) // serializes to "undefined\n" — not JSON
  const result = await runMunkel(["yolbe", "all", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Keine gültige Antwort")
})

test("missing app yields a helpful error", async () => {
  const result = await runMunkel(["yolbe", "all", "hi"])

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Munkel-App läuft nicht")
})

test("no arguments prints usage with exit 64", async () => {
  const result = await runMunkel([])

  expect(result.exitCode).toBe(64)
  expect(result.stdout).toContain("munkel <gruppe> <empfänger|all>")
})

test("--help prints usage with exit 0", async () => {
  const result = await runMunkel(["--help"])

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("flüstere deinen Freunden")
})

test("too few send arguments prints usage error", async () => {
  const result = await runMunkel(["yolbe", "Jurij"])

  expect(result.exitCode).toBe(64)
  expect(result.stderr).toContain("usage: munkel")
})
