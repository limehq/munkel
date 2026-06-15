import { expect, test, describe, beforeEach, afterEach } from 'bun:test';
import { EventEmitter } from 'node:events';
import { RelayClient } from '../relay-client';
import type { ServerMessage } from '@munkel/core';
import type WebSocket from 'ws';

class MockSocket extends EventEmitter {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState = MockSocket.CONNECTING;
	sent: string[] = [];
	closed = false;

	constructor(public readonly url: string) {
		super();
	}

	open(): void {
		this.readyState = MockSocket.OPEN;
		this.emit('open');
	}

	receive(message: ServerMessage): void {
		this.emit('message', JSON.stringify(message));
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.readyState = MockSocket.CLOSED;
		this.emit('close');
	}
}

function waitFor(condition: () => boolean, timeout = 1000): Promise<void> {
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

describe('RelayClient', () => {
	let sockets: MockSocket[] = [];
	let client: RelayClient | null = null;

	beforeEach(() => {
		sockets = [];
	});

	afterEach(() => {
		client?.disconnect();
		client = null;
		for (const socket of sockets) {
			socket.removeAllListeners();
		}
	});

	function createFactory() {
		return (url: string): WebSocket => {
			const socket = new MockSocket(url);
			sockets.push(socket);
			return socket as unknown as WebSocket;
		};
	}

	test('connects to the relay URL with group and member query params', async () => {
		const factory = createFactory();
		client = new RelayClient('wss://relay.example.com/', 'abc123', 'member-1', {
			createWebSocket: factory,
		});
		client.connect();

		await waitFor(() => sockets.length === 1);
		expect(sockets[0].url).toBe('wss://relay.example.com/ws?group=abc123&member=member-1');
	});

	test('emits frame events for incoming server messages', async () => {
		const factory = createFactory();
		client = new RelayClient('wss://relay.example.com', 'group', 'member', {
			createWebSocket: factory,
		});

		const frames: ServerMessage[] = [];
		client.on('frame', (frame: ServerMessage) => frames.push(frame));

		client.connect();
		await waitFor(() => sockets.length === 1);
		sockets[0].open();
		sockets[0].receive({ type: 'pong' });

		await waitFor(() => frames.length === 1);
		expect(frames[0]).toEqual({ type: 'pong' });
	});

	test('send returns false when not connected and true when open', async () => {
		const factory = createFactory();
		client = new RelayClient('wss://relay.example.com', 'group', 'member', {
			createWebSocket: factory,
		});

		client.connect();
		await waitFor(() => sockets.length === 1);

		expect(client.send({ type: 'ping' })).toBe(false);

		sockets[0].open();
		expect(client.send({ type: 'ping' })).toBe(true);
		expect(sockets[0].sent).toEqual(['{"type":"ping"}']);
	});

	test('reconnects with exponential backoff after an unexpected close', async () => {
		const factory = createFactory();
		client = new RelayClient('wss://relay.example.com', 'group', 'member', {
			createWebSocket: factory,
		});

		const disconnectedEvents: unknown[] = [];
		client.on('disconnected', () => disconnectedEvents.push(true));

		client.connect();
		await waitFor(() => sockets.length === 1);
		sockets[0].open();
		sockets[0].close();

		await waitFor(() => disconnectedEvents.length === 1);
		await waitFor(() => sockets.length === 2, 1500);
	});

	test('disconnect prevents reconnection', async () => {
		const factory = createFactory();
		client = new RelayClient('wss://relay.example.com', 'group', 'member', {
			createWebSocket: factory,
		});

		client.connect();
		await waitFor(() => sockets.length === 1);
		sockets[0].open();
		client.disconnect();

		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(sockets.length).toBe(1);
	});
});
