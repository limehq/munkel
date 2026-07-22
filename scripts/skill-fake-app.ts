#!/usr/bin/env bun
// Scriptable stand-in for the Munkel app's control socket. Lets us test the
// `munkel` CLI and skill steering without the real app, relay, or notch: it
// logs every request as JSONL and answers per FAKE_SCENARIO. Mirrors the wire
// contract in MunkelKit/ControlProtocol.swift.
import { appendFileSync, existsSync, unlinkSync } from "node:fs"

const socketPath = process.env.FAKE_SOCKET
const logPath = process.env.FAKE_LOG
const scenario = process.env.FAKE_SCENARIO ?? "happy"
if (!socketPath || !logPath) {
  console.error("skill-fake-app: set FAKE_SOCKET and FAKE_LOG")
  process.exit(2)
}
if (existsSync(socketPath)) unlinkSync(socketPath)

const channels = (members: Record<string, string[]>) =>
  Object.entries(members).map(([code, m]) => ({ code, connected: true, members: m }))

function respond(req: { action?: string; group?: string; to?: string }): unknown | undefined {
  if (scenario === "silent") return undefined

  if (req.action === "groups") {
    if (scenario === "unknown") return { ok: true, groups: channels({ "blue-table-42": ["Alex"] }) }
    return {
      ok: true,
      groups: channels({ "blue-table-42": ["Sim", "Alex"], "green-room-17": ["Sam"] }),
    }
  }

  if (req.action === "send") {
    const to = (req.to ?? "").toLowerCase()
    const isBroadcast = to === "all" || to === "*"
    // Channel-scoped sends (explicit group) and broadcasts always succeed —
    // this is the disambiguation path the agent should fall back to.
    if (req.group || isBroadcast) return { ok: true }

    if (scenario === "ambiguous") {
      return {
        ok: false,
        error: `"${req.to}" is in blue-table-42, green-room-17 — say \`munkel <channel> ${req.to} …\``,
        groups: channels({ "blue-table-42": ["Sim", "Alex"], "green-room-17": ["Sim", "Sam"] }),
      }
    }
    if (scenario === "unknown") {
      return {
        ok: false,
        error: `No online member matches "${req.to}" — munkel channels shows who's online`,
      }
    }
    return { ok: true }
  }

  return { ok: false, error: `unknown action ${req.action}` }
}

Bun.listen({
  unix: socketPath,
  socket: {
    data(sock, data) {
      let req: { action?: string; group?: string; to?: string; raw?: string }
      try {
        req = JSON.parse(data.toString().split("\n")[0])
      } catch {
        req = { raw: data.toString() }
      }
      appendFileSync(logPath, JSON.stringify(req) + "\n")
      const res = respond(req)
      if (res !== undefined) {
        sock.write(JSON.stringify(res) + "\n")
        sock.end()
      }
      // silent: keep the connection open and never reply → CLI hits its timeout.
    },
  },
})
console.error(`skill-fake-app: listening on ${socketPath} (scenario=${scenario})`)
