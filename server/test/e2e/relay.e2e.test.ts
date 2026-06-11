/// <reference types="node" />

import { createServer } from 'node:net';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

const READY_TIMEOUT_MS = 45_000;

const GROUP_A = 'a'.repeat(32);
const GROUP_B = 'b'.repeat(32);

let wrangler: ChildProcess | null = null;
let port = 8787;
let wranglerLogs = '';
const openClients: TestClient[] = [];

type Frame = Record<string, unknown> & { type: string };

class TestClient {
  private readonly ws: WebSocket;
  private readonly inbox: Frame[] = [];
  private readonly waiters: { predicate: (frame: Frame) => boolean; resolve: (frame: Frame) => void }[] = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString()) as Frame;
      const index = this.waiters.findIndex((w) => w.predicate(frame));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        waiter.resolve(frame);
      } else {
        this.inbox.push(frame);
      }
    });
  }

  static async connect(group: string, member: string): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?group=${group}&member=${member}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
    const client = new TestClient(ws);
    openClients.push(client);
    return client;
  }

  send(frame: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(frame));
  }

  sendRaw(data: string): void {
    this.ws.send(data);
  }

  next(predicate: (frame: Frame) => boolean = () => true, timeoutMs = 5000): Promise<Frame> {
    const index = this.inbox.findIndex(predicate);
    if (index >= 0) {
      const [frame] = this.inbox.splice(index, 1);
      return Promise.resolve(frame);
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve: (frame: Frame) => { clearTimeout(timer); resolve(frame); } };
      const timer = setTimeout(() => {
        const at = this.waiters.indexOf(waiter);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error(`Timed out waiting for frame (inbox: ${JSON.stringify(this.inbox)})`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  async expectNone(predicate: (frame: Frame) => boolean, windowMs = 400): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, windowMs));
    const hit = this.inbox.find(predicate);
    expect(hit, `expected no matching frame, got ${JSON.stringify(hit)}`).toBeUndefined();
  }

  close(): void {
    this.ws.close();
  }
}

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('no port'));
        return;
      }
      const found = address.port;
      server.close(() => resolve(found));
    });
  });
}

async function waitForReady(proc: ChildProcess): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`wrangler dev exited early with code ${proc.exitCode}. Logs:\n${wranglerLogs}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`wrangler dev not ready after ${READY_TIMEOUT_MS}ms. Logs:\n${wranglerLogs}`);
}

beforeAll(async () => {
  port = await findAvailablePort();
  wrangler = spawn(
    join(process.cwd(), 'node_modules', '.bin', 'wrangler'),
    ['dev', '--port', String(port)],
    { cwd: process.cwd(), env: { ...process.env, CI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  wrangler.stdout?.on('data', (chunk) => { wranglerLogs += chunk.toString(); });
  wrangler.stderr?.on('data', (chunk) => { wranglerLogs += chunk.toString(); });
  await waitForReady(wrangler);
});

afterEach(() => {
  for (const client of openClients.splice(0)) {
    client.close();
  }
});

afterAll(() => {
  wrangler?.kill('SIGTERM');
});

test('health endpoint responds', async () => {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('ok');
});

test('rejects invalid group ids before upgrade', async () => {
  await expect(TestClient.connect('not-a-group', 'alice')).rejects.toThrow('HTTP 400');
});

test('welcome lists present members, peers see joins', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  const aliceWelcome = await alice.next((f) => f.type === 'welcome');
  expect(aliceWelcome.members).toEqual([]);

  const bob = await TestClient.connect(GROUP_A, 'bob');
  const bobWelcome = await bob.next((f) => f.type === 'welcome');
  expect(bobWelcome.members).toEqual(['alice']);

  const joined = await alice.next((f) => f.type === 'peer-joined');
  expect(joined.memberId).toBe('bob');
});

test('broadcast reaches the group but not the sender or other groups', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  const bob = await TestClient.connect(GROUP_A, 'bob');
  const eve = await TestClient.connect(GROUP_B, 'eve');
  await alice.next((f) => f.type === 'welcome');
  await bob.next((f) => f.type === 'welcome');
  await eve.next((f) => f.type === 'welcome');

  alice.send({ type: 'send', payload: 'Y2lwaGVydGV4dA==' });

  const received = await bob.next((f) => f.type === 'message');
  expect(received.from).toBe('alice');
  expect(received.payload).toBe('Y2lwaGVydGV4dA==');

  await alice.expectNone((f) => f.type === 'message');
  await eve.expectNone((f) => f.type === 'message');
});

test('direct message reaches only the recipient', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  const bob = await TestClient.connect(GROUP_A, 'bob');
  const carol = await TestClient.connect(GROUP_A, 'carol');
  await alice.next((f) => f.type === 'welcome');
  await bob.next((f) => f.type === 'welcome');
  await carol.next((f) => f.type === 'welcome');

  alice.send({ type: 'send', payload: 'ZGlyZWN0', to: 'bob' });

  const received = await bob.next((f) => f.type === 'message');
  expect(received.from).toBe('alice');
  expect(received.to).toBe('bob');

  await carol.expectNone((f) => f.type === 'message');
});

test('sending to an unknown member yields an error', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  await alice.next((f) => f.type === 'welcome');

  alice.send({ type: 'send', payload: 'ZGlyZWN0', to: 'nobody' });

  const error = await alice.next((f) => f.type === 'error');
  expect(error.code).toBe('unknown-recipient');
});

test('disconnect broadcasts peer-left', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  const bob = await TestClient.connect(GROUP_A, 'bob');
  await alice.next((f) => f.type === 'welcome');
  await bob.next((f) => f.type === 'welcome');

  bob.close();

  const left = await alice.next((f) => f.type === 'peer-left');
  expect(left.memberId).toBe('bob');
});

test('invalid frames yield protocol errors', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  await alice.next((f) => f.type === 'welcome');

  alice.sendRaw('not json');
  const jsonError = await alice.next((f) => f.type === 'error');
  expect(jsonError.code).toBe('invalid-message');

  alice.send({ type: 'send' });
  const schemaError = await alice.next((f) => f.type === 'error');
  expect(schemaError.code).toBe('invalid-message');
});

test('ping is answered with pong', async () => {
  const alice = await TestClient.connect(GROUP_A, 'alice');
  await alice.next((f) => f.type === 'welcome');

  alice.send({ type: 'ping' });
  await alice.next((f) => f.type === 'pong');
});
