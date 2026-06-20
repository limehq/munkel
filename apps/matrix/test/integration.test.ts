// Live integration test for @munkel/matrix. REQUIRES a running dev homeserver
// (infra/matrix/scripts/up.sh). Excluded from the default `bun test`/turbo.
//   bun run test:integration     (runs on Node 24 — rust-crypto WASM)
//
// Proves, end to end against Synapse: two members in one circle (joined by the
// code-derived alias, no invite), a Megolm-encrypted broadcast that decrypts for
// the peer, a targeted direct message, an image-blob round-trip through Matrix
// media, and welcome / peer-joined / peer-left presence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { MunkelMatrixSession, MemoryCredStore, InMemoryBlobIndex } from "../src/index.ts";
import type { MunkelSessionEvents } from "../src/index.ts";

const baseUrl = process.env.MATRIX_BASE_URL ?? "http://localhost:8008";
const serverName = process.env.MATRIX_SERVER_NAME ?? "munkel.localhost";
const sharedSecret = process.env.MATRIX_REGISTRATION_SHARED_SECRET ?? "munkel-dev-shared-secret-change-me";
const pwPepper = process.env.MATRIX_PW_PEPPER ?? "munkel-dev-pw-pepper-change-me";

function randomGroupId(): string {
  return createHash("sha256").update(randomUUID()).digest("hex").slice(0, 32);
}

/** Collects emitted events and lets a test await a specific one. */
class Collector implements MunkelSessionEvents {
  welcome: string[] = [];
  readonly joined: string[] = [];
  readonly left: string[] = [];
  readonly messages: { from: string; payload: string; to?: string }[] = [];
  private readonly waiters: { pred: () => boolean; resolve: () => void }[] = [];

  onWelcome(memberIds: string[]): void {
    this.welcome = memberIds;
    this.tick();
  }
  onPeerJoined(memberId: string): void {
    this.joined.push(memberId);
    this.tick();
  }
  onPeerLeft(memberId: string): void {
    this.left.push(memberId);
    this.tick();
  }
  onMessage(from: string, payload: string, to?: string): void {
    this.messages.push({ from, payload, to });
    this.tick();
  }
  private tick(): void {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      if (this.waiters[i].pred()) {
        this.waiters[i].resolve();
        this.waiters.splice(i, 1);
      }
    }
  }
  await(pred: () => boolean, label: string, timeoutMs = 20_000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), timeoutMs);
      this.waiters.push({ pred, resolve: () => { clearTimeout(timer); resolve(); } });
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("two members exchange Megolm messages, blobs and presence in one circle", async (t) => {
  const groupId = randomGroupId();
  const store = new MemoryCredStore();
  const blobIndex = new InMemoryBlobIndex();
  const memberA = `a-${randomUUID().slice(0, 8)}`;
  const memberB = `b-${randomUUID().slice(0, 8)}`;
  const colA = new Collector();
  const colB = new Collector();

  const common = { baseUrl, serverName, sharedSecret, pwPepper, groupId, store, blobIndex };

  const a = await MunkelMatrixSession.open({ ...common, memberId: memberA, events: colA });
  const b = await MunkelMatrixSession.open({ ...common, memberId: memberB, events: colB });

  t.after(async () => { await a.close().catch(() => {}); await b.close().catch(() => {}); });

  // Both ended up in the SAME room via the derived alias (no invite).
  assert.equal(a.matrixRoomId, b.matrixRoomId, "A and B must share one room");

  // Presence: A sees B join (B opened second); B's welcome lists A.
  await colA.await(() => colA.joined.includes(memberB), "A sees B join");
  assert.ok(colB.welcome.includes(memberA), `B welcome should list A, got ${JSON.stringify(colB.welcome)}`);
  await sleep(1500); // let device-key download + Megolm session share settle

  // Broadcast A -> B, decrypted.
  const broadcast = `hello-${randomUUID()}`;
  await a.send(broadcast);
  await colB.await(() => colB.messages.some((m) => m.payload === broadcast), "B receives A broadcast");
  const recvd = colB.messages.find((m) => m.payload === broadcast)!;
  assert.equal(recvd.from, memberA, "broadcast sender maps back to A's memberId");
  assert.equal(recvd.to, undefined, "broadcast has no target");

  // Direct message B -> A, tagged to A only.
  const direct = `direct-${randomUUID()}`;
  await b.sendDirect(memberA, direct);
  await colA.await(() => colA.messages.some((m) => m.payload === direct), "A receives B direct");
  const dm = colA.messages.find((m) => m.payload === direct)!;
  assert.equal(dm.from, memberB);
  assert.equal(dm.to, memberA, "direct message carries the target memberId");

  // Image blob round-trip through Matrix media: A puts sealed ciphertext, B gets it.
  const key = randomUUID().replace(/-/g, "");
  const ciphertext = randomBytes(4096);
  await a.putBlob(key, ciphertext);
  const fetched = await b.getBlob(key);
  assert.deepEqual(Buffer.from(fetched), ciphertext, "B fetches the exact bytes A stored");

  // Presence: B leaves -> A sees peer-left.
  await b.close();
  await colA.await(() => colA.left.includes(memberB), "A sees B leave");
});

test("concurrent opens converge on one room (create-or-join race)", async (t) => {
  const groupId = randomGroupId();
  const store = new MemoryCredStore();
  const blobIndex = new InMemoryBlobIndex();
  const common = { baseUrl, serverName, sharedSecret, pwPepper, groupId, store, blobIndex };
  const silent: MunkelSessionEvents = { onWelcome() {}, onPeerJoined() {}, onPeerLeft() {}, onMessage() {} };

  // Two members race to create the same fresh circle: one wins createRoom, the
  // other must hit M_ROOM_IN_USE and resolve+join the same room.
  const [a, b] = await Promise.all([
    MunkelMatrixSession.open({ ...common, memberId: `a-${randomUUID().slice(0, 8)}`, events: silent }),
    MunkelMatrixSession.open({ ...common, memberId: `b-${randomUUID().slice(0, 8)}`, events: silent }),
  ]);
  t.after(async () => { await a.close().catch(() => {}); await b.close().catch(() => {}); });

  assert.equal(a.matrixRoomId, b.matrixRoomId, "concurrent opens must converge on one room");
});
