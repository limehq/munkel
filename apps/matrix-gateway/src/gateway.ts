// Munkel WebSocket relay protocol, backed by Matrix. Each ws connection becomes
// one MunkelMatrixSession; client `send`/`ping` and server welcome/peer-*/message
// frames are bridged to/from Matrix rooms. The unchanged Swift app + CLI talk to
// this exactly as they talk to the Cloudflare relay (MUNKEL_RELAY_URL=ws://…),
// including the same-origin /blob/<group>/<key> media endpoints.
//
// Semantics mirror apps/server/src/group-room.ts: welcome lists OTHER members,
// a message is never echoed to its sender, peer-left fires when a member leaves,
// ping is answered locally. We import the REAL protocol.ts so the wire contract
// is byte-identical (no drift).
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { MunkelMatrixSession, MemoryCredStore, InMemoryBlobIndex, UnknownRecipientError, MAX_BLOB_BYTES } from "../../matrix/src/index.ts";
import type { CredStore, BlobIndex } from "../../matrix/src/index.ts";
import { clientMessageSchema, GROUP_ID_REGEX, MEMBER_ID_REGEX } from "../../server/src/protocol.ts";

/** Mirrors apps/server/src/blob.ts (client-generated per-image object id). */
const BLOB_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_CONNECTIONS_PER_GROUP = 32;
const MAX_FRAME_BYTES = 64 * 1024; // protocol frame budget (apps/server/src/protocol.ts)
const STALE_TIMEOUT_MS = 120_000; // mirror group-room.ts idle reaper
const HEARTBEAT_INTERVAL_MS = 30_000;

export interface GatewayOpts {
  port: number;
  matrixBaseUrl: string;
  serverName: string;
  sharedSecret: string;
  pwPepper: string;
}

export interface GatewayHandle {
  port: number;
  close(): Promise<void>;
}

type ServerFrame =
  | { type: "welcome"; members: string[] }
  | { type: "peer-joined"; memberId: string }
  | { type: "peer-left"; memberId: string }
  | { type: "message"; from: string; to?: string; payload: string }
  | { type: "pong" }
  | { type: "error"; code: string; message: string };

export function startGateway(opts: GatewayOpts): Promise<GatewayHandle> {
  const store: CredStore = new MemoryCredStore();
  const blobIndex: BlobIndex = new InMemoryBlobIndex();
  // group -> live sessions (services blob PUT/GET, which arrive without a ws).
  const groups = new Map<string, Set<MunkelMatrixSession>>();

  function addToGroup(group: string, session: MunkelMatrixSession): void {
    let set = groups.get(group);
    if (!set) groups.set(group, (set = new Set()));
    set.add(session);
  }
  function removeFromGroup(group: string, session: MunkelMatrixSession): void {
    const set = groups.get(group);
    if (!set) return;
    set.delete(session);
    if (set.size === 0) groups.delete(group);
  }
  function anySession(group: string): MunkelMatrixSession | undefined {
    return groups.get(group)?.values().next().value;
  }

  const httpServer = createServer((req, res) => void handleHttp(req, res));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  // Reap dead connections (mirrors group-room.ts's 120s stale reaper). A live
  // client also sends app-level pings; this catches TCP that died silently.
  const liveness = new WeakMap<WebSocket, { lastSeen: number; isAlive: boolean }>();
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      const live = liveness.get(ws);
      if (!live) continue;
      if (!live.isAlive || now - live.lastSeen > STALE_TIMEOUT_MS) {
        ws.terminate();
        continue;
      }
      live.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref?.();

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws") return rejectUpgrade(socket, 404);
    const group = url.searchParams.get("group") ?? "";
    const member = url.searchParams.get("member") ?? "";
    if (!GROUP_ID_REGEX.test(group)) return rejectUpgrade(socket, 400);
    if (!MEMBER_ID_REGEX.test(member)) return rejectUpgrade(socket, 400);
    if ((groups.get(group)?.size ?? 0) >= MAX_CONNECTIONS_PER_GROUP) return rejectUpgrade(socket, 503);
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, group, member));
  });

  function onConnection(ws: WebSocket, group: string, member: string): void {
    const send = (frame: ServerFrame): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
    };

    liveness.set(ws, { lastSeen: Date.now(), isAlive: true });
    ws.on("pong", () => {
      const live = liveness.get(ws);
      if (live) {
        live.isAlive = true;
        live.lastSeen = Date.now();
      }
    });

    let session: MunkelMatrixSession | undefined;
    let closed = false;
    const pending: string[] = []; // frames received before the session is ready

    MunkelMatrixSession.open({
      baseUrl: opts.matrixBaseUrl,
      serverName: opts.serverName,
      sharedSecret: opts.sharedSecret,
      pwPepper: opts.pwPepper,
      groupId: group,
      memberId: member,
      store,
      blobIndex,
      events: {
        onWelcome: (members) => send({ type: "welcome", members }),
        onPeerJoined: (memberId) => send({ type: "peer-joined", memberId }),
        onPeerLeft: (memberId) => send({ type: "peer-left", memberId }),
        onMessage: (from, payload, to) => send(to ? { type: "message", from, to, payload } : { type: "message", from, payload }),
      },
    })
      .then((opened) => {
        if (closed) return void opened.close().catch(() => {});
        session = opened;
        addToGroup(group, opened);
        for (const raw of pending.splice(0)) void handleClientFrame(raw);
      })
      .catch((err) => {
        send({ type: "error", code: "invalid-message", message: `backend unavailable: ${String(err)}` });
        ws.close(1011, "backend error");
      });

    async function handleClientFrame(raw: string): Promise<void> {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return send({ type: "error", code: "invalid-message", message: "Frame is not valid JSON" });
      }
      const parsed = clientMessageSchema.safeParse(json);
      if (!parsed.success) {
        return send({ type: "error", code: "invalid-message", message: "Frame does not match protocol" });
      }
      if (parsed.data.type === "ping") return send({ type: "pong" });
      // type === "send"
      if (!session) return; // shouldn't happen (we drain pending after open)
      try {
        if (parsed.data.to) await session.sendDirect(parsed.data.to, parsed.data.payload);
        else await session.send(parsed.data.payload);
      } catch (err) {
        if (err instanceof UnknownRecipientError) {
          send({ type: "error", code: "unknown-recipient", message: err.message });
        } else {
          send({ type: "error", code: "invalid-message", message: `send failed: ${String(err)}` });
        }
      }
    }

    ws.on("message", (data, isBinary) => {
      const live = liveness.get(ws);
      if (live) live.lastSeen = Date.now();
      if (isBinary) return send({ type: "error", code: "invalid-message", message: "Binary frames are not supported" });
      const raw = data.toString();
      if (session) void handleClientFrame(raw);
      else pending.push(raw);
    });
    ws.on("close", () => {
      closed = true;
      if (session) {
        removeFromGroup(group, session);
        void session.close().catch(() => {});
      }
    });
    ws.on("error", () => ws.close());
  }

  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "", "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") return text(res, 200, "ok");

    const blob = url.pathname.match(/^\/blob\/([^/]+)\/([^/]+)$/);
    if (blob) {
      const group = decodeURIComponent(blob[1]);
      const key = decodeURIComponent(blob[2]);
      if (req.method === "PUT") return void handleBlobPut(req, res, group, key);
      if (req.method === "GET") return void handleBlobGet(res, group, key);
    }
    return text(res, 404, "Not found");
  }

  async function handleBlobPut(req: IncomingMessage, res: ServerResponse, group: string, key: string): Promise<void> {
    if (!GROUP_ID_REGEX.test(group)) return text(res, 400, "Invalid group");
    if (!BLOB_KEY_REGEX.test(key)) return text(res, 400, "Invalid key");
    const session = anySession(group);
    if (!session) return text(res, 503, "No active member to store the blob");
    const body = await readBody(req, MAX_BLOB_BYTES);
    if (body === null) return text(res, 413, "Payload too large");
    if (body.byteLength === 0) return text(res, 400, "Empty body");
    try {
      await session.putBlob(key, body);
      return text(res, 204, "");
    } catch (err) {
      return text(res, 502, `upload failed: ${String(err)}`);
    }
  }

  async function handleBlobGet(res: ServerResponse, group: string, key: string): Promise<void> {
    if (!GROUP_ID_REGEX.test(group) || !BLOB_KEY_REGEX.test(key)) return text(res, 404, "Not found");
    const session = anySession(group);
    if (!session) return text(res, 404, "Not found");
    try {
      const bytes = await session.getBlob(key);
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(Buffer.from(bytes));
    } catch {
      return text(res, 404, "Not found");
    }
  }

  return new Promise((resolve) => {
    httpServer.listen(opts.port, "127.0.0.1", () => {
      const addr = httpServer.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : opts.port;
      resolve({
        port: actualPort,
        close: () => {
          clearInterval(heartbeat);
          return closeGateway(httpServer, wss, groups);
        },
      });
    });
  });
}

async function closeGateway(
  httpServer: Server,
  wss: WebSocketServer,
  groups: Map<string, Set<MunkelMatrixSession>>,
): Promise<void> {
  const sessions = [...groups.values()].flatMap((s) => [...s]);
  await Promise.all(sessions.map((s) => s.close().catch(() => {})));
  for (const ws of wss.clients) ws.terminate();
  await new Promise<void>((resolve) => wss.close(() => resolve()));
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}

function rejectUpgrade(socket: Duplex, status: number): void {
  const reason = status === 404 ? "Not Found" : status === 503 ? "Service Unavailable" : "Bad Request";
  socket.write(`HTTP/1.1 ${status} ${reason}\r\n\r\n`);
  socket.destroy();
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(body);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
