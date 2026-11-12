import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { WebSocketServer, WebSocket } from 'ws';
import { deriveGroupKeys, seal, open, sealRaw, encodeChat, encodeProfile, MAX_CHAT_CHARS } from '../../core';
import { GroupSession, buildEchoImages, RECEIVED_IMAGES_LRU_CAP } from '../group-session';
import { getCircleColor } from '../../shared/group-color';
import type { CircleState, NotchMessage } from '../../shared/types';
import type { ImageItem } from '../../core';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function getPort(server: WebSocketServer): number {
	const address = server.address();
	if (typeof address === 'string') {
		throw new Error('Expected address to be an object');
	}
	return address.port;
}

class Collector<T> extends Array<T> {
	static get [Symbol.species](): ArrayConstructor {
		return Array;
	}

	private waiters: Array<{ predicate: () => boolean; resolve: () => void }> = [];

	push(...items: T[]): number {
		const length = super.push(...items);
		this.waiters = this.waiters.filter((waiter) => {
			if (!waiter.predicate()) return true;
			waiter.resolve();
			return false;
		});
		return length;
	}

	until(predicate: () => boolean): Promise<void> {
		if (predicate()) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.waiters.push({ predicate, resolve });
		});
	}
}

function collectFrames(socket: WebSocket): Collector<unknown> {
	const frames = new Collector<unknown>();
	socket.on('message', (data) => {
		frames.push(JSON.parse(data.toString()));
	});
	return frames;
}

describe('GroupSession', () => {
	let server: WebSocketServer | null = null;
	let serverSocket: WebSocket | null = null;
	let connected: Promise<WebSocket> = new Promise(() => {});
	const sessions: GroupSession[] = [];
	const memberId = 'windows-member';

	beforeEach(() => {
		serverSocket = null;
		connected = new Promise(() => {});
	});

	afterEach(() => {
		for (const session of sessions) {
			session.disconnect();
		}
		sessions.length = 0;
		server?.close();
		server = null;
	});

	async function createSession(
		...args: Parameters<typeof GroupSession.create>
	): Promise<GroupSession> {
		const session = await GroupSession.create(...args);
		sessions.push(session);
		return session;
	}

	function startServer(): WebSocketServer {
		const wss = new WebSocketServer({ port: 0 });
		connected = new Promise<WebSocket>((resolve) => {
			wss.once('connection', (ws) => {
				serverSocket = ws;
				resolve(ws);
			});
		});
		server = wss;
		return wss;
	}

	async function handshake(members: string[] = []): Promise<Collector<unknown>> {
		const socket = await connected;
		const frames = collectFrames(socket);
		socket.send(JSON.stringify({ type: 'welcome', members }));
		await frames.until(() => frames.length >= 1);
		return frames;
	}

	test('connects and reflects welcome members in state', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;

		const states = new Collector<CircleState>();
		const session = await createSession(
			'blue-table-42',
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1', 'peer-2'] }));

		await states.until(() => states.some((s) => s.isConnected && s.members.length === 2));
		const state = states[states.length - 1];
		expect(state.isConnected).toBe(true);
		expect(state.members.map((m) => m.memberId)).toEqual(['peer-1', 'peer-2']);

		session.disconnect();
	});

	test('decrypts profile messages and updates member names', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'lunar-owl';
		const { messageKey } = await deriveGroupKeys(code);

		const states = new Collector<CircleState>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await states.until(() => states.some((s) => s.isConnected));

		const profilePayload = encodeProfile('Alice');
		const sealed = await seal(JSON.stringify(profilePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await states.until(
			() => states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.displayName === 'Alice')),
		);

		session.disconnect();
	});

	test('clears an existing avatar when an incoming profile omits it', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'amber-fox';
		const { messageKey } = await deriveGroupKeys(code);

		const states = new Collector<CircleState>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await states.until(() => states.some((s) => s.isConnected));

		// Step 1: peer-1 broadcasts a profile WITH an avatar.
		const withAvatar = encodeProfile('Alice', 'data:image/png;base64,AAAA');
		const sealed1 = await seal(JSON.stringify(withAvatar), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed1 }));
		await states.until(() =>
			states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.avatar === 'data:image/png;base64,AAAA')),
		);

		// Step 2: peer-1 broadcasts a profile WITHOUT an avatar → must clear.
		const cleared = encodeProfile('AliceNew');
		const sealed2 = await seal(JSON.stringify(cleared), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed2 }));
		await states.until(() =>
			states.some((s) => {
				const m = s.members.find((m) => m.memberId === 'peer-1');
				return m?.displayName === 'AliceNew' && m.avatar === undefined;
			}),
		);

		session.disconnect();
	});

	test('does not set an avatar on a fresh peer when the incoming profile omits it', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'cobalt-hare';
		const { messageKey } = await deriveGroupKeys(code);

		const states = new Collector<CircleState>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		// Welcome with NO peer-1 yet; the profile frame introduces them.
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await states.until(() => states.some((s) => s.isConnected));

		const profilePayload = encodeProfile('Bob');
		const sealed = await seal(JSON.stringify(profilePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-2', payload: sealed }));

		await states.until(() =>
			states.some((s) => {
				const m = s.members.find((m) => m.memberId === 'peer-2');
				return m?.displayName === 'Bob' && m.avatar === undefined;
			}),
		);

		session.disconnect();
	});

	test('decodes profile status and updates member status', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'lunar-owl';
		const { messageKey } = await deriveGroupKeys(code);

		const states = new Collector<CircleState>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await states.until(() => states.some((s) => s.isConnected));

		const profilePayload = encodeProfile('Alice', { status: 'dnd' });
		const sealed = await seal(JSON.stringify(profilePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await states.until(
			() => states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.status === 'dnd')),
		);

		session.disconnect();
	});

	test('profile payload without status preserves existing member status', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'lunar-owl';
		const { messageKey } = await deriveGroupKeys(code);

		const states = new Collector<CircleState>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await states.until(() => states.some((s) => s.isConnected));

		// Step 1: establish a known status via presence.
		const presencePayload = { kind: 'presence', status: 'dnd' };
		const sealed1 = await seal(JSON.stringify(presencePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed1 }));
		await states.until(
			() => states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.status === 'dnd')),
		);

		// Step 2: profile without status must NOT reset to online.
		const profilePayload = encodeProfile('Alice');
		const sealed2 = await seal(JSON.stringify(profilePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed2 }));
		await states.until(
			() => states.some((s) => {
				const m = s.members.find((m) => m.memberId === 'peer-1');
				return m?.displayName === 'Alice' && m.status === 'dnd';
			}),
		);

		session.disconnect();
	});

	test('decodes presence payload and updates member status', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'lunar-owl';
		const { messageKey } = await deriveGroupKeys(code);

		const states = new Collector<CircleState>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await states.until(() => states.some((s) => s.isConnected));

		const presencePayload = { kind: 'presence', status: 'away' };
		const sealed = await seal(JSON.stringify(presencePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await states.until(
			() => states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.status === 'away')),
		);

		session.disconnect();
	});

	test('broadcasts presence payload on status change', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'lunar-owl';
		const { messageKey } = await deriveGroupKeys(code);

		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		const frames = collectFrames(await connected);
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await frames.until(() => frames.length >= 1);

		await session.broadcastPresence('dnd');
		await frames.until(() => frames.length >= 2);

		const payloads = await Promise.all(
			frames
				.filter((f) => (f as { type: string }).type === 'send')
				.map(async (f) => JSON.parse(await open((f as { payload: string }).payload, messageKey))),
		);
		const presence = payloads.find((p) => p.kind === 'presence');
		expect(presence).toBeDefined();
		expect(presence.status).toBe('dnd');

		session.disconnect();
	});

	test('receives chat messages and fires onChat + onNotch', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'solar-kite';
		const { messageKey } = await deriveGroupKeys(code);

		const chats = new Collector<{ sender: string; text: string; isDirect: boolean; sentAt: string }>();
		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: (payload) => chats.push(payload),
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));

		const chatPayload = encodeChat('Hello Windows!');
		const sealed = await seal(JSON.stringify(chatPayload), messageKey);
		serverSocket!.send(
			JSON.stringify({ type: 'message', from: 'peer-1', to: memberId, payload: sealed }),
		);

		await Promise.all([
			chats.until(() => chats.length === 1),
			notches.until(() => notches.length === 1),
		]);
		expect(chats[0].sender).toBe('peer-1');
		expect(chats[0].text).toBe('Hello Windows!');
		expect(chats[0].isDirect).toBe(true);
		expect(notches[0].text).toBe('Hello Windows!');
		expect(notches[0].group).toBe(code);
		expect(notches[0].senderMemberId).toBe('peer-1');
		expect(notches[0].receivedAt).toEqual(expect.any(String));
		expect(notches[0].receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(notches[0].sentAt).toBe(chatPayload.sentAt);

		session.disconnect();
	});

	test('clamps an over-cap incoming chat message to 2048 characters before dispatch (Plan 12)', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'cedar-brook';
		const { messageKey } = await deriveGroupKeys(code);

		const chats = new Collector<{ sender: string; text: string; isDirect: boolean; sentAt: string }>();
		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: (payload) => chats.push(payload),
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));

		// A peer sending oversized plaintext (bypassing this app's own UI
		// clamp) must still be clamped on receipt, mirroring macOS
		// GroupSession.swift's symmetric MessageLimits.clamp on the chat
		// branch. 3000 chars stays comfortably under the ~48 KiB wire cap so
		// this exercises the 2048-char display clamp specifically, not the
		// unrelated byte-size protocol cap.
		const overLong = 'a'.repeat(3000);
		const chatPayload = encodeChat(overLong);
		const sealed = await seal(JSON.stringify(chatPayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await Promise.all([
			chats.until(() => chats.length === 1),
			notches.until(() => notches.length === 1),
		]);
		expect(chats[0].text.length).toBe(2048);
		expect(chats[0].text).toBe('a'.repeat(2048));
		expect(notches[0].text.length).toBe(2048);
		expect(notches[0].text).toBe('a'.repeat(2048));

		session.disconnect();
	});

	test('sendChat seals and sends a chat frame', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'green-apple-99';
		const { messageKey } = await deriveGroupKeys(code);

		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;

		const frames = new Collector<unknown>();
		serverSocket!.on('message', (data) => {
			frames.push(JSON.parse(data.toString()));
		});

		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await frames.until(() => frames.length > 0 && (frames[0] as { type: string }).type === 'send');
		// The first send is the profile broadcast after welcome.
		const profileFrame = frames[0] as { type: string; payload: string };
		expect(profileFrame.type).toBe('send');

		const sent = await session.sendChat('Hello from Windows');
		expect(sent).toEqual({ ok: true });

		await frames.until(() => frames.length >= 2);
		const chatFrame = frames[1] as { type: string; payload: string };
		expect(chatFrame.type).toBe('send');

		const plaintext = await decrypt(chatFrame.payload, messageKey);
		expect(plaintext.kind).toBe('chat');
		expect(plaintext.text).toBe('Hello from Windows');

		session.disconnect();
	});

	test('dev-echo (Plan 13 item 6): echoes a successful broadcast chat into onNotch when shouldEchoBroadcasts() is enabled', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'echo-broadcast-on';

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 2,
				shouldEchoBroadcasts: () => true,
			},
		);
		session.connect();
		await handshake();

		const sent = await session.sendChat('Hello myself');
		expect(sent).toEqual({ ok: true });

		expect(notches).toHaveLength(1);
		expect(notches[0]!.sender).toBe('Windows User');
		expect(notches[0]!.senderMemberId).toBe(memberId);
		expect(notches[0]!.text).toBe('Hello myself');
		expect(notches[0]!.isDirect).toBe(false);
		expect(notches[0]!.sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		expect(notches[0]!.group).toBe(code);
		expect(notches[0]!.groupColor).toBe(getCircleColor(2));
		expect(notches[0]!.images).toBeUndefined();

		session.disconnect();
	});

	test('dev-echo (Plan 13 item 6): does not echo when shouldEchoBroadcasts() is disabled', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'echo-broadcast-off';

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
				shouldEchoBroadcasts: () => false,
			},
		);
		session.connect();
		await handshake();

		const sent = await session.sendChat('Should not echo');
		expect(sent).toEqual({ ok: true });
		expect(notches).toHaveLength(0);

		session.disconnect();
	});

	test('dev-echo (Plan 13 item 6): does not echo when shouldEchoBroadcasts is omitted entirely (default off)', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'echo-broadcast-omitted';

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
			},
		);
		session.connect();
		await handshake();

		const sent = await session.sendChat('No echo callback at all');
		expect(sent).toEqual({ ok: true });
		expect(notches).toHaveLength(0);

		session.disconnect();
	});

	test('dev-echo (#123): echoes a private (to: memberId) chat with recipientMemberId when shouldEchoBroadcasts() is enabled', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'echo-private-not-echoed';

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
				shouldEchoBroadcasts: () => true,
			},
		);
		session.connect();
		await handshake();

		const sent = await session.sendChat('Just for peer-1', 'peer-1');
		expect(sent).toEqual({ ok: true, echoed: true });
		expect(notches).toHaveLength(1);
		expect(notches[0]!.sender).toBe('Windows User');
		expect(notches[0]!.senderMemberId).toBe(memberId);
		expect(notches[0]!.text).toBe('Just for peer-1');
		expect(notches[0]!.isDirect).toBe(true);
		expect(notches[0]!.recipientMemberId).toBe('peer-1');

		session.disconnect();
	});

	test('dev-echo (Plan 13 item 6): does not echo a failed send even when shouldEchoBroadcasts() is enabled', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'echo-failed-send';

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
				shouldEchoBroadcasts: () => true,
			},
		);
		session.connect();
		await handshake();

		session.disconnect();
		const result = await session.sendChat('hello');
		expect(result).toEqual({ ok: false, error: 'Circle offline — message not sent.' });
		expect(notches).toHaveLength(0);
	});

	test('truncates an over-length chat to MAX_CHAT_CHARS before sending', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'paper-river';
		const { messageKey } = await deriveGroupKeys(code);

		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;

		const frames = new Collector<unknown>();
		serverSocket!.on('message', (data) => {
			frames.push(JSON.parse(data.toString()));
		});

		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await frames.until(() => frames.length > 0 && (frames[0] as { type: string }).type === 'send');

		const longText = 'x'.repeat(MAX_CHAT_CHARS + 100);
		const sent = await session.sendChat(longText);
		expect(sent).toEqual({ ok: true });

		await frames.until(() => frames.length >= 2);
		const chatFrame = frames[1] as { type: string; payload: string };
		expect(chatFrame.type).toBe('send');

		const plaintext = await decrypt(chatFrame.payload, messageKey);
		expect(plaintext.kind).toBe('chat');
		expect(plaintext.text?.length).toBe(MAX_CHAT_CHARS);
		expect(plaintext.text).toBe('x'.repeat(MAX_CHAT_CHARS));

		session.disconnect();
	});

	test('sends an under-cap emoji chat intact, not truncated by UTF-16 code units (#51)', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'emoji-river';
		const { messageKey } = await deriveGroupKeys(code);

		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;

		const frames = new Collector<unknown>();
		serverSocket!.on('message', (data) => {
			frames.push(JSON.parse(data.toString()));
		});

		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await frames.until(() => frames.length > 0 && (frames[0] as { type: string }).type === 'send');

		const emojiText = '😀'.repeat(1500);
		const sent = await session.sendChat(emojiText);
		expect(sent).toEqual({ ok: true });

		await frames.until(() => frames.length >= 2);
		const chatFrame = frames[1] as { type: string; payload: string };
		expect(chatFrame.type).toBe('send');

		const plaintext = await decrypt(chatFrame.payload, messageKey);
		expect(plaintext.kind).toBe('chat');
		expect(plaintext.text).toBe(emojiText);

		session.disconnect();
	});

	test('decrypts incoming image albums and fires onNotch with images[]', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'opal-finch';
		const { messageKey } = await deriveGroupKeys(code);

		const notches = new Collector<import('../../shared/types').NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 3,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));

		const imagePayload = {
			kind: 'image',
			items: [
				{ r2Key: 'a'.repeat(16), mime: 'image/avif', width: 800, height: 600, byteLen: 12345, thumb: 'AAAA' },
				{ r2Key: 'b'.repeat(16), mime: 'image/avif', width: 1024, height: 768, byteLen: 67890, thumb: 'BBBB' },
			],
			caption: 'look at this',
			sentAt: '2025-06-01T12:00:00.000Z',
		};
		const sealed = await seal(JSON.stringify(imagePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await notches.until(() => notches.length >= 1);

		expect(notches[0]!.images).toHaveLength(2);
		expect(notches[0]!.images![0]!.id).toBe('a'.repeat(16));
		expect(notches[0]!.images![0]!.width).toBe(800);
		expect(notches[0]!.images![1]!.thumb).toBe('BBBB');
		expect(notches[0]!.text).toBe('look at this');
		expect(notches[0]!.senderMemberId).toBe('peer-1');
		expect(notches[0]!.groupColor).toBe(getCircleColor(3));
		expect(notches[0]!.receivedAt).toEqual(expect.any(String));
		expect(notches[0]!.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		session.disconnect();
	});

	test('sendImages drops invalid images and fails only when none survive', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'parallel-album';

		const tempDir = await mkdtemp(join(tmpdir(), 'munkel-sendimages-'));
		const path1 = join(tempDir, 'a.png');
		const path2 = join(tempDir, 'b.png');
		await writeFile(path1, 'not-a-valid-image-1');
		await writeFile(path2, 'not-a-valid-image-2');

		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));

		const result = await session.sendImages([path1, path2], 'album caption');
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toBe('Could not send any images');
			expect(result.skipped).toHaveLength(2);
			expect(result.skipped![0]!.reason).toContain('Could not encode');
		}

		session.disconnect();
	});

	test('clamps an over-cap incoming image caption to 2048 characters before dispatch (Plan 12)', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'quartz-lynx';
		const { messageKey } = await deriveGroupKeys(code);

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));

		const imagePayload = {
			kind: 'image',
			items: [
				{ r2Key: 'a'.repeat(16), mime: 'image/avif', width: 800, height: 600, byteLen: 12345, thumb: 'AAAA' },
			],
			caption: 'c'.repeat(2500),
			sentAt: '2025-06-01T12:00:00.000Z',
		};
		const sealed = await seal(JSON.stringify(imagePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await notches.until(() => notches.length >= 1);
		expect(notches[0]!.text.length).toBe(2048);
		expect(notches[0]!.text).toBe('c'.repeat(2048));

		session.disconnect();
	});

	test('receivedImages evicts the oldest entry after RECEIVED_IMAGES_LRU_CAP keys', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'lru-images';
		const { messageKey } = await deriveGroupKeys(code);

		const notches = new Collector<NotchMessage>();
		const session = await createSession(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User', presenceStatus: 'online' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await connected;
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));

		const oldestKey = 'key-00000000000001';
		const newestKey = 'key-00000000000021';

		for (let index = 1; index <= RECEIVED_IMAGES_LRU_CAP + 1; index += 1) {
			const r2Key = `key-${String(index).padStart(14, '0')}`;
			const imagePayload = {
				kind: 'image',
				items: [{ r2Key, mime: 'image/avif', width: 1, height: 1, byteLen: 1, thumb: 'AA' }],
				caption: '',
				sentAt: '2025-06-01T12:00:00.000Z',
			};
			const sealed = await seal(JSON.stringify(imagePayload), messageKey);
			serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));
		}

		await notches.until(() => notches.length >= RECEIVED_IMAGES_LRU_CAP + 1);

		expect(session.findImageMime(oldestKey)).toBeUndefined();
		expect(session.findImageMime(newestKey)).toBe('image/avif');

		session.disconnect();
	});
});

async function decrypt(payload: string, messageKey: CryptoKey): Promise<{ kind: string; text?: string }> {
	const plaintext = await open(payload, messageKey);
	return JSON.parse(plaintext) as { kind: string; text?: string };
}

describe('GroupSession.loadFullImage (Plan 14 task 2 — download+openRaw path)', () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	async function createSession(code: string): Promise<GroupSession> {
		return GroupSession.create(code, 'ws://relay.invalid/ws', 'windows-member', { displayName: 'Windows User' }, {
			onStateChange: () => {},
			onChat: () => {},
			onNotch: () => {},
			getColorIndex: () => 0,
		});
	}

	test('downloads and decrypts the blob, returning the original plaintext bytes', async () => {
		const code = 'preview-happy-path';
		const { messageKey } = await deriveGroupKeys(code);
		const session = await createSession(code);

		const plaintext = new Uint8Array([1, 2, 3, 4, 5, 250]);
		const sealed = await sealRaw(plaintext, messageKey);
		globalThis.fetch = (async () => new Response(sealed, { status: 200 })) as typeof fetch;

		const result = await session.loadFullImage('r2-key-abc');

		expect(result).toEqual(plaintext);
	});

	test('returns null (never throws) when the relay download fails (e.g. 404)', async () => {
		const code = 'preview-download-404';
		const session = await createSession(code);

		globalThis.fetch = (async () => new Response('not found', { status: 404 })) as typeof fetch;

		const result = await session.loadFullImage('missing-key');

		expect(result).toBeNull();
	});

	test('returns null (never throws) on a network error', async () => {
		const code = 'preview-network-error';
		const session = await createSession(code);

		globalThis.fetch = (async () => {
			throw new Error('ECONNREFUSED');
		}) as typeof fetch;

		const result = await session.loadFullImage('any-key');

		expect(result).toBeNull();
	});

	test('returns null (never throws) when the ciphertext cannot be opened with this session\'s key (wrong/corrupted blob)', async () => {
		const code = 'preview-bad-ciphertext';
		const { messageKey: wrongKey } = await deriveGroupKeys('a-completely-different-circle');
		const session = await createSession(code);

		// Sealed with a different circle's key — openRaw must fail to decrypt.
		const sealedWithWrongKey = await sealRaw(new Uint8Array([9, 9, 9]), wrongKey);
		globalThis.fetch = (async () => new Response(sealedWithWrongKey, { status: 200 })) as typeof fetch;

		const result = await session.loadFullImage('any-key');

		expect(result).toBeNull();
	});

	test('returns null when the relay responds 200 with an empty body', async () => {
		const code = 'preview-empty-body';
		const session = await createSession(code);

		globalThis.fetch = (async () => new Response(new Uint8Array(0), { status: 200 })) as typeof fetch;

		const result = await session.loadFullImage('any-key');

		expect(result).toBeNull();
	});
});

describe('buildEchoImages (Plan 13 item 6)', () => {
	test('maps each ImageItem to an IncomingImage, reusing the same thumb/dims already built for the wire send', () => {
		const items: ImageItem[] = [
			{ r2Key: 'a'.repeat(16), mime: 'image/avif', width: 800, height: 600, byteLen: 12345, thumb: 'AAAA' },
			{ r2Key: 'b'.repeat(16), mime: 'image/avif', width: 1024, height: 768, byteLen: 67890, thumb: 'BBBB' },
		];

		expect(buildEchoImages(items)).toEqual([
			{ id: 'a'.repeat(16), thumb: 'AAAA', width: 800, height: 600 },
			{ id: 'b'.repeat(16), thumb: 'BBBB', width: 1024, height: 768 },
		]);
	});

	test('returns an empty array for an empty items list', () => {
		expect(buildEchoImages([])).toEqual([]);
	});

	test('preserves item order (album ordering matters for the echoed preview row)', () => {
		const items: ImageItem[] = [
			{ r2Key: 'first-key-000000', mime: 'image/avif', width: 1, height: 1, byteLen: 1, thumb: '1' },
			{ r2Key: 'second-key-00000', mime: 'image/avif', width: 2, height: 2, byteLen: 2, thumb: '2' },
			{ r2Key: 'third-key-000000', mime: 'image/avif', width: 3, height: 3, byteLen: 3, thumb: '3' },
		];

		expect(buildEchoImages(items).map((img) => img.id)).toEqual([
			'first-key-000000',
			'second-key-00000',
			'third-key-000000',
		]);
	});
});
