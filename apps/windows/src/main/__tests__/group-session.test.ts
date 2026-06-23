import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { WebSocketServer, WebSocket } from 'ws';
import { deriveGroupKeys, seal, open, encodeChat, encodeProfile } from '../../core';
import { GroupSession } from '../group-session';
import { getCircleColor } from '../../shared/group-color';
import type { CircleState, NotchMessage } from '../../shared/types';

function getPort(server: WebSocketServer): number {
	const address = server.address();
	if (typeof address === 'string') {
		throw new Error('Expected address to be an object');
	}
	return address.port;
}

function waitFor(condition: () => boolean, timeout = 2000): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			if (condition()) {
				resolve();
				return;
			}
			if (Date.now() - start > timeout) {
				reject(new Error('Timeout waiting for condition'));
				return;
			}
			setTimeout(check, 10);
		};
		check();
	});
}

describe('GroupSession', () => {
	let server: WebSocketServer | null = null;
	let serverSocket: WebSocket | null = null;
	const memberId = 'windows-member';

	beforeEach(() => {
		serverSocket = null;
	});

	afterEach(() => {
		server?.close();
		server = null;
	});

	function startServer(): WebSocketServer {
		const wss = new WebSocketServer({ port: 0 });
		wss.on('connection', (ws) => {
			serverSocket = ws;
		});
		server = wss;
		return wss;
	}

	test('connects and reflects welcome members in state', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;

		const states: CircleState[] = [];
		const session = await GroupSession.create(
			'blue-table-42',
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await waitFor(() => serverSocket !== null);
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1', 'peer-2'] }));

		await waitFor(() => states.some((s) => s.isConnected && s.members.length === 2));
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

		const states: CircleState[] = [];
		const session = await GroupSession.create(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await waitFor(() => serverSocket !== null);
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await waitFor(() => states.some((s) => s.isConnected));

		const profilePayload = encodeProfile('Alice');
		const sealed = await seal(JSON.stringify(profilePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed }));

		await waitFor(
			() => states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.displayName === 'Alice')),
		);

		session.disconnect();
	});

	test('clears an existing avatar when an incoming profile omits it', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'amber-fox';
		const { messageKey } = await deriveGroupKeys(code);

		const states: CircleState[] = [];
		const session = await GroupSession.create(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await waitFor(() => serverSocket !== null);
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));
		await waitFor(() => states.some((s) => s.isConnected));

		// Step 1: peer-1 broadcasts a profile WITH an avatar.
		const withAvatar = encodeProfile('Alice', 'data:image/png;base64,AAAA');
		const sealed1 = await seal(JSON.stringify(withAvatar), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed1 }));
		await waitFor(() =>
			states.some((s) => s.members.some((m) => m.memberId === 'peer-1' && m.avatar === 'data:image/png;base64,AAAA')),
		);

		// Step 2: peer-1 broadcasts a profile WITHOUT an avatar → must clear.
		const cleared = encodeProfile('AliceNew');
		const sealed2 = await seal(JSON.stringify(cleared), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-1', payload: sealed2 }));
		await waitFor(() =>
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

		const states: CircleState[] = [];
		const session = await GroupSession.create(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: (state) => states.push(state),
				onChat: () => {},
				onNotch: () => {},
				getColorIndex: () => 0,
			},
		);
		session.connect();

		await waitFor(() => serverSocket !== null);
		// Welcome with NO peer-1 yet; the profile frame introduces them.
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await waitFor(() => states.some((s) => s.isConnected));

		const profilePayload = encodeProfile('Bob');
		const sealed = await seal(JSON.stringify(profilePayload), messageKey);
		serverSocket!.send(JSON.stringify({ type: 'message', from: 'peer-2', payload: sealed }));

		await waitFor(() =>
			states.some((s) => {
				const m = s.members.find((m) => m.memberId === 'peer-2');
				return m?.displayName === 'Bob' && m.avatar === undefined;
			}),
		);

		session.disconnect();
	});

	test('receives chat messages and fires onChat + onNotch', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'solar-kite';
		const { messageKey } = await deriveGroupKeys(code);

		const chats: { sender: string; text: string; isDirect: boolean; sentAt: string }[] = [];
		const notches: NotchMessage[] = [];
		const session = await GroupSession.create(
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

		await waitFor(() => serverSocket !== null);
		serverSocket!.send(JSON.stringify({ type: 'welcome', members: ['peer-1'] }));

		const chatPayload = encodeChat('Hello Windows!');
		const sealed = await seal(JSON.stringify(chatPayload), messageKey);
		serverSocket!.send(
			JSON.stringify({ type: 'message', from: 'peer-1', to: memberId, payload: sealed }),
		);

		await waitFor(() => chats.length === 1 && notches.length === 1);
		expect(chats[0].sender).toBe('peer-1');
		expect(chats[0].text).toBe('Hello Windows!');
		expect(chats[0].isDirect).toBe(true);
		expect(notches[0].text).toBe('Hello Windows!');
		expect(notches[0].group).toBe(code);

		session.disconnect();
	});

	test('sendChat seals and sends a chat frame', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'green-apple-99';
		const { messageKey } = await deriveGroupKeys(code);

		const session = await GroupSession.create(
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

		await waitFor(() => serverSocket !== null);

		const frames: unknown[] = [];
		serverSocket!.on('message', (data) => {
			frames.push(JSON.parse(data.toString()));
		});

		serverSocket!.send(JSON.stringify({ type: 'welcome', members: [] }));
		await waitFor(() => frames.length > 0 && (frames[0] as { type: string }).type === 'send');
		// The first send is the profile broadcast after welcome.
		const profileFrame = frames[0] as { type: string; payload: string };
		expect(profileFrame.type).toBe('send');

		const sent = await session.sendChat('Hello from Windows');
		expect(sent).toEqual({ ok: true });

		await waitFor(() => frames.length >= 2);
		const chatFrame = frames[1] as { type: string; payload: string };
		expect(chatFrame.type).toBe('send');

		const plaintext = await decrypt(chatFrame.payload, messageKey);
		expect(plaintext.kind).toBe('chat');
		expect(plaintext.text).toBe('Hello from Windows');

		session.disconnect();
	});

	test('rejects an over-cap chat with a "too long" SendResult before sealing', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'paper-river';
		const session = await GroupSession.create(
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

		await waitFor(() => serverSocket !== null);

		// 60 KiB of plaintext — well over MAX_PAYLOAD_CHARS (48 KiB base64).
		const hugeText = 'x'.repeat(60_000);
		const result = await session.sendChat(hugeText);
		expect(result.ok).toBe(false);
		expect(result.error?.toLowerCase()).toContain('too long');

		session.disconnect();
	});

	test('decrypts incoming image albums and fires onNotch with images[]', async () => {
		const wss = startServer();
		const relayUrl = `ws://127.0.0.1:${getPort(wss)}`;
		const code = 'opal-finch';
		const { messageKey } = await deriveGroupKeys(code);

		const notches: import('../../shared/types').NotchMessage[] = [];
		const session = await GroupSession.create(
			code,
			relayUrl,
			memberId,
			{ displayName: 'Windows User' },
			{
				onStateChange: () => {},
				onChat: () => {},
				onNotch: (message) => notches.push(message),
				getColorIndex: () => 3,
			},
		);
		session.connect();

		await waitFor(() => serverSocket !== null);
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

		await waitFor(() => notches.length >= 1);

		expect(notches[0]!.images).toHaveLength(2);
		expect(notches[0]!.images![0]!.id).toBe('a'.repeat(16));
		expect(notches[0]!.images![0]!.width).toBe(800);
		expect(notches[0]!.images![1]!.thumb).toBe('BBBB');
		expect(notches[0]!.text).toBe('look at this');
		expect(notches[0]!.groupColor).toBe(getCircleColor(3));

		session.disconnect();
	});
});

async function decrypt(payload: string, messageKey: CryptoKey): Promise<{ kind: string; text?: string }> {
	const plaintext = await open(payload, messageKey);
	return JSON.parse(plaintext) as { kind: string; text?: string };
}
