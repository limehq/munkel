import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"

// Runs the CLI as a subprocess against a fake app listening on a temporary
// Unix socket (FLUSTR_SOCKET overrides the default path).

const cliPath = new URL("../src/flustr.ts", import.meta.url).pathname

let stopFakeApp: (() => void) | undefined
afterEach(() => {
  stopFakeApp?.()
  stopFakeApp = undefined
})

function fakeApp(respond: (request: unknown) => unknown) {
  const socketPath = join(tmpdir(), `flustr-test-${process.pid}-${Math.random().toString(36).slice(2)}.sock`)
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

async function runFlustr(args: string[], socketPath = "/nonexistent/control.sock") {
  const proc = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, FLUSTR_SOCKET: socketPath },
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
  const result = await runFlustr(["yolbe", "Jurij", "hey", "du"], app.socketPath)

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
  const result = await runFlustr(["groups"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("● yolbe  —  Anna, Ben")
  expect(result.stdout).toContain("○ kaffee-falke-42  —  niemand sonst online")
  expect(app.requests).toEqual([{ action: "groups" }])
})

test("groups with no groups prints hint", async () => {
  const app = fakeApp(() => ({ ok: true, groups: [] }))
  const result = await runFlustr(["groups"], app.socketPath)

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("Keine Gruppen")
})

test("app error is reported on stderr", async () => {
  const app = fakeApp(() => ({ ok: false, error: "Unbekannte Gruppe: nope" }))
  const result = await runFlustr(["nope", "all", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Unbekannte Gruppe: nope")
})

test("invalid response is rejected", async () => {
  const app = fakeApp(() => undefined) // serializes to "undefined\n" — not JSON
  const result = await runFlustr(["yolbe", "all", "hi"], app.socketPath)

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Keine gültige Antwort")
})

test("missing app yields a helpful error", async () => {
  const result = await runFlustr(["yolbe", "all", "hi"])

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("Flüsterung-App läuft nicht")
})

test("no arguments prints usage with exit 64", async () => {
  const result = await runFlustr([])

  expect(result.exitCode).toBe(64)
  expect(result.stdout).toContain("flustr <gruppe> <empfänger|all>")
})

test("--help prints usage with exit 0", async () => {
  const result = await runFlustr(["--help"])

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("flüstere deinen Freunden")
})

test("too few send arguments prints usage error", async () => {
  const result = await runFlustr(["yolbe", "Jurij"])

  expect(result.exitCode).toBe(64)
  expect(result.stderr).toContain("usage: flustr")
})
