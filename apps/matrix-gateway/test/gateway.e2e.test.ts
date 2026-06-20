// Live e2e for the Munkel→Matrix gateway. REQUIRES a running dev homeserver
// (infra/matrix/scripts/up.sh). Excluded from the default `bun test`/turbo.
//   bun run test:e2e     (runs on Node 24)
//
// Drives the gateway with raw WebSocket clients speaking Munkel's exact wire
// protocol — the same frames the Swift app/CLI send — and asserts presence,
// broadcast, direct messaging, the unknown-recipient error, ping/pong, and the
// same-origin /blob round-trip, all carried over Matrix underneath.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { WebSocket } from "ws";
import { startGateway } from "../src/gateway.ts";
import type { GatewayHandle } from "../src/gateway.ts";

const env = {
  matrixBaseUrl: process.env.MATRIX_BASE_URL ?? "http://localhost:8008",
  serverName: process.env.MATRIX_SERVER_NAME ?? "munkel.localhost",
  sharedSecret: process.env.MATRIX_REGISTRATION_SHARED_SECRET ?? "munkel-dev-shared-secret-change-me",
  pwPepper: process.env.MATRIX_PW_PEPPER ?? "munkel-dev-pw-pepper-change-me",
};

const groupId = (): string => createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32);

type Frame = Record<string, unknown> & { type: string };

class Client {
  private readonly inbox: Frame[] = [];
  private readonly waiters: { pred: (f: Frame) => boolean; resolve: (f: Frame) => void }[] = [];
  private readonly ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (d) => {
      const f = JSON.parse(d.toString()) as Frame;
      const i = this.waiters.findIndex((w) => w.pred(f));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(f);
      else this.inbox.push(f);
    });
  }
  static connect(port: number, group: string, member: string): Promise<Client> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?group=${group}&member=${member}`);
    return new Promise((resolve, reject) => {
      ws.once("open", () => resolve(new Client(ws)));
      ws.once("unexpected-response", (_r, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once("error", reject);
    });
  }
  send(frame: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(frame));
  }
  sendRaw(s: string): void {
    this.ws.send(s);
  }
  next(pred: (f: Frame) => boolean = () => true, timeoutMs = 25_000): Promise<Frame> {
    const i = this.inbox.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout waiting for frame")), timeoutMs);
      this.waiters.push({ pred, resolve: (f) => { clearTimeout(timer); resolve(f); } });
    });
  }
  close(): void {
    this.ws.close();
  }
}

let gw: GatewayHandle;
let port = 0;

test("gateway bridges Munkel's protocol over Matrix", async (t) => {
  gw = await startGateway({ port: 0, ...env });
  port = gw.port;
  t.after(() => gw.close());

  await t.test("health endpoint", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok");
  });

  await t.test("rejects invalid group before upgrade", async () => {
    await assert.rejects(Client.connect(port, "not-a-group", "alice"), /HTTP 400/);
  });

  await t.test("welcome, presence, broadcast, direct, errors, ping, blob", async () => {
    const group = groupId();
    const alice = await Client.connect(port, group, "alice");
    const aliceWelcome = await alice.next((f) => f.type === "welcome");
    assert.deepEqual(aliceWelcome.members, []);

    const bob = await Client.connect(port, group, "bob");
    const bobWelcome = await bob.next((f) => f.type === "welcome");
    assert.deepEqual(bobWelcome.members, ["alice"], "bob's welcome lists alice");
    const joined = await alice.next((f) => f.type === "peer-joined");
    assert.equal(joined.memberId, "bob");

    // ping/pong is answered locally
    alice.send({ type: "ping" });
    await alice.next((f) => f.type === "pong");

    // broadcast reaches bob (opaque base64 payload survives the Matrix round-trip)
    const payload = Buffer.from(`broadcast-${randomUUID()}`).toString("base64");
    alice.send({ type: "send", payload });
    const got = await bob.next((f) => f.type === "message");
    assert.equal(got.from, "alice");
    assert.equal(got.payload, payload);
    assert.equal(got.to, undefined);

    // direct message reaches only the target, tagged with `to`
    const dm = Buffer.from(`dm-${randomUUID()}`).toString("base64");
    bob.send({ type: "send", payload: dm, to: "alice" });
    const dmGot = await alice.next((f) => f.type === "message" && f.payload === dm);
    assert.equal(dmGot.from, "bob");
    assert.equal(dmGot.to, "alice");

    // unknown recipient yields the protocol error
    alice.send({ type: "send", payload, to: "nobody" });
    const err = await alice.next((f) => f.type === "error");
    assert.equal(err.code, "unknown-recipient");

    // invalid frame yields invalid-message
    alice.sendRaw("not json");
    const perr = await alice.next((f) => f.type === "error");
    assert.equal(perr.code, "invalid-message");

    // same-origin blob round-trip (Matrix media under the hood)
    const key = randomUUID().replace(/-/g, "");
    const ciphertext = randomBytes(2048);
    const put = await fetch(`http://127.0.0.1:${port}/blob/${group}/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: ciphertext,
    });
    assert.ok(put.status >= 200 && put.status < 300, `blob PUT ok, got ${put.status}`);
    const get = await fetch(`http://127.0.0.1:${port}/blob/${group}/${key}`);
    assert.equal(get.status, 200);
    const back = Buffer.from(await get.arrayBuffer());
    assert.deepEqual(back, ciphertext, "blob GET returns the exact bytes");

    // peer-left when bob disconnects
    bob.close();
    const left = await alice.next((f) => f.type === "peer-left");
    assert.equal(left.memberId, "bob");

    alice.close();
  });
});
