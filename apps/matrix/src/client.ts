// MunkelMatrixSession — one (groupId, memberId) pairing == one ws connection's
// worth of Matrix. It hides every Matrix detail behind Munkel's vocabulary:
// open() provisions + joins + syncs + enables Megolm, then emits welcome /
// peer-joined / peer-left / message exactly as the bespoke relay would.
import * as sdk from "matrix-js-sdk";
import { ClientEvent, RoomEvent } from "matrix-js-sdk";
import type { MatrixClient, MatrixEvent, Room } from "matrix-js-sdk";
import { ensureMatrixUser } from "./provision.ts";
import type { CredStore } from "./provision.ts";
import { initCircleCrypto, awaitDecrypted, isUsableMessage, waitForRoomEncryption } from "./crypto.ts";
import { joinOrCreateCircle, onMembership } from "./room.ts";
import { putBlob, getBlob, resolveBlob } from "./media.ts";
import type { BlobIndex } from "./media.ts";
import { toMatrixContent, fromMatrixEvent, registerIdentity, memberIdForMxid } from "./mapping.ts";

/** Thrown by sendDirect when the target memberId isn't a joined member. */
export class UnknownRecipientError extends Error {
  readonly memberId: string;
  constructor(memberId: string) {
    super(`No member "${memberId}" in this circle`);
    this.name = "UnknownRecipientError";
    this.memberId = memberId;
  }
}

export interface MunkelSessionEvents {
  onWelcome(memberIds: string[]): void;
  onPeerJoined(memberId: string): void;
  onPeerLeft(memberId: string): void;
  onMessage(from: string, payload: string, to?: string): void;
}

export interface MunkelSessionOpts {
  baseUrl: string;
  serverName: string;
  sharedSecret: string;
  pwPepper: string;
  groupId: string;
  memberId: string;
  store: CredStore;
  blobIndex: BlobIndex;
  events: MunkelSessionEvents;
}

export class MunkelMatrixSession {
  private readonly client: MatrixClient;
  private readonly roomId: string;
  private readonly selfMxid: string;
  private readonly opts: MunkelSessionOpts;
  private unsubscribe: () => void;

  private constructor(
    client: MatrixClient,
    roomId: string,
    selfMxid: string,
    opts: MunkelSessionOpts,
    unsubscribe: () => void,
  ) {
    this.client = client;
    this.roomId = roomId;
    this.selfMxid = selfMxid;
    this.opts = opts;
    this.unsubscribe = unsubscribe;
  }

  static async open(opts: MunkelSessionOpts): Promise<MunkelMatrixSession> {
    const creds = await ensureMatrixUser({
      baseUrl: opts.baseUrl,
      sharedSecret: opts.sharedSecret,
      pwPepper: opts.pwPepper,
      memberId: opts.memberId,
      store: opts.store,
    });
    registerIdentity(opts.memberId, creds.userId);

    const client = sdk.createClient({
      baseUrl: opts.baseUrl,
      userId: creds.userId,
      accessToken: creds.accessToken,
      deviceId: creds.deviceId,
      store: new sdk.MemoryStore(),
    });
    await initCircleCrypto(client);
    await client.startClient({ initialSyncLimit: 1 }); // tiny — we don't want history
    await waitForPrepared(client);

    const roomId = await joinOrCreateCircle(client, opts.groupId, opts.serverName);
    // Never let a send race ahead of the m.room.encryption state landing locally —
    // that would silently downgrade the first message to a plaintext event.
    await waitForRoomEncryption(client, roomId);

    const session = new MunkelMatrixSession(client, roomId, creds.userId, opts, () => {});
    session.wire();

    // welcome: the OTHER members currently joined (mirror relay's membersExcept).
    // Query the server authoritatively — right after joinRoom the local sync view
    // may not yet list peers, and lazy-loading omits members who never spoke.
    const others = (await session.fetchJoinedMxids())
      .filter((mxid) => mxid !== creds.userId)
      .map(memberIdForMxid);
    opts.events.onWelcome(dedupe(others));
    return session;
  }

  private wire(): void {
    const stopMembership = onMembership(
      this.client,
      this.roomId,
      (mxid) => {
        if (mxid === this.selfMxid) return;
        this.opts.events.onPeerJoined(memberIdForMxid(mxid));
      },
      (mxid) => {
        if (mxid === this.selfMxid) return;
        this.opts.events.onPeerLeft(memberIdForMxid(mxid));
      },
    );

    const onTimeline = (event: MatrixEvent, room: Room | undefined, toStartOfTimeline?: boolean): void => {
      if (toStartOfTimeline) return; // never replay history (offline == missed)
      if (room?.roomId !== this.roomId) return;
      if (event.getSender() === this.selfMxid) return; // own echo (cheap pre-decrypt filter)
      void this.deliver(event);
    };
    this.client.on(RoomEvent.Timeline, onTimeline);

    this.unsubscribe = () => {
      stopMembership();
      this.client.off(RoomEvent.Timeline, onTimeline);
    };
  }

  private async deliver(event: MatrixEvent): Promise<void> {
    await awaitDecrypted(event);
    if (!isUsableMessage(this.client, event)) return;
    const munkel = fromMatrixEvent(event);
    if (!munkel) return;
    // Direct-message targeting: a tagged message is for one member only.
    if (munkel.to && munkel.to !== this.opts.memberId) return;
    const from = memberIdForMxid(event.getSender() ?? "");
    this.opts.events.onMessage(from, munkel.payload, munkel.to);
  }

  /** Broadcast a Munkel payload to the whole circle. */
  async send(payload: string): Promise<void> {
    await this.assertEncrypted();
    await this.client.sendEvent(this.roomId, "m.room.message" as never, toMatrixContent(payload) as never);
  }

  /** Send a Munkel payload to one member; gateway-enforced targeted delivery. */
  async sendDirect(toMemberId: string, payload: string): Promise<void> {
    const targetJoined = (await this.fetchJoinedMxids()).some(
      (mxid) => memberIdForMxid(mxid) === toMemberId,
    );
    if (!targetJoined) throw new UnknownRecipientError(toMemberId);
    await this.assertEncrypted();
    await this.client.sendEvent(this.roomId, "m.room.message" as never, toMatrixContent(payload, toMemberId) as never);
  }

  /** Refuse to send if the room isn't Megolm-encrypted (no silent plaintext downgrade). */
  private async assertEncrypted(): Promise<void> {
    const enabled = await this.client.getCrypto()?.isEncryptionEnabledInRoom(this.roomId);
    if (!enabled) throw new Error("refusing to send: room encryption is not enabled");
  }

  /** Authoritative joined-member MXIDs from the server (no local sync race). */
  async fetchJoinedMxids(): Promise<string[]> {
    const res = await this.client.getJoinedRoomMembers(this.roomId);
    return Object.keys(res.joined ?? {});
  }

  /** Store sealed image ciphertext; keyed by (groupId, key) for cross-member GET. */
  async putBlob(key: string, ciphertext: Uint8Array): Promise<void> {
    await putBlob(this.client, this.opts.blobIndex, this.opts.groupId, key, ciphertext);
  }

  /** Fetch sealed image ciphertext a peer stored under (groupId, key). */
  async getBlob(key: string): Promise<Uint8Array> {
    const ref = resolveBlob(this.opts.blobIndex, this.opts.groupId, key);
    if (!ref) throw new Error(`unknown blob: ${key}`);
    return getBlob(this.client, ref);
  }

  get matrixRoomId(): string {
    return this.roomId;
  }

  /** Leave + forget the circle (so peers see peer-left, no stale membership) and tear down. */
  async close(): Promise<void> {
    this.unsubscribe();
    try {
      await Promise.race([
        this.client.leave(this.roomId).then(() => this.client.forget(this.roomId)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // best-effort — we're going away regardless
    }
    this.client.stopClient();
  }
}

function waitForPrepared(client: MatrixClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSync = (state: string): void => {
      if (state === "PREPARED") {
        client.off(ClientEvent.Sync, onSync);
        resolve();
      } else if (state === "ERROR") {
        client.off(ClientEvent.Sync, onSync);
        reject(new Error("initial sync failed"));
      }
    };
    client.on(ClientEvent.Sync, onSync);
  });
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}
