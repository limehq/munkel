import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { WebSocketServer, WebSocket } from 'ws';
import { deriveGroupKeys, seal, open, encodeChat, encodeProfile } from '../../core';
import { GroupSession } from '../group-session';
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
		expect(sent).toBe(true);

		await waitFor(() => frames.length >= 2);
		const chatFrame = frames[1] as { type: string; payload: string };
		expect(chatFrame.type).toBe('send');

		const plaintext = await decrypt(chatFrame.payload, messageKey);
		expect(plaintext.kind).toBe('chat');
		expect(plaintext.text).toBe('Hello from Windows');

		session.disconnect();
	});
});

async function decrypt(payload: string, messageKey: CryptoKey): Promise<{ kind: string; text?: string }> {
	const plaintext = await open(payload, messageKey);
	return JSON.parse(plaintext) as { kind: string; text?: string };
}
