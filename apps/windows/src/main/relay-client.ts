import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../core';

export type RelayEvent =
	| { kind: 'frame'; frame: ServerMessage }
	| { kind: 'disconnected' }
	| { kind: 'error'; error: Error };

/**
 * Reconnecting WebSocket client for one group relay.
 *
 * Emits:
 *  - `frame`      when a server message arrives.
 *  - `disconnected` when the socket closes and a reconnect will be attempted.
 *  - `error`      on socket errors or unparseable frames.
 */
export class RelayClient extends EventEmitter {
	private readonly url: string;
	private readonly createWebSocket: (url: string) => WebSocket;
	private socket: WebSocket | null = null;
	private running = false;
	private backoffMs = 1000;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;

	constructor(
		relayUrl: string,
		groupId: string,
		memberId: string,
		options?: { createWebSocket?: (url: string) => WebSocket },
	) {
		super();
		this.url = `${relayUrl.replace(/\/$/, '')}/ws?group=${groupId}&member=${memberId}`;
		this.createWebSocket = options?.createWebSocket ?? ((url) => new WebSocket(url));
	}

	connect(): void {
		if (this.running) return;
		this.running = true;
		this.backoffMs = 1000;
		this.connectNow();
	}

	disconnect(): void {
		this.running = false;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.stopPing();
		if (this.socket) {
			try {
				this.socket.close();
			} catch {
				// Ignore close errors.
			}
			this.socket = null;
		}
	}

	send(message: ClientMessage): boolean {
		if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
			return false;
		}
		try {
			this.socket.send(JSON.stringify(message));
			return true;
		} catch {
			return false;
		}
	}

	private connectNow(): void {
		if (!this.running) return;

		try {
			const socket = this.createWebSocket(this.url);
			this.socket = socket;

			socket.on('open', () => {
				this.backoffMs = 1000;
				this.startPing();
			});

			socket.on('message', (data) => {
				this.handleMessage(data);
			});

			socket.on('error', (err: Error) => {
				this.emit('error', err);
			});

			socket.on('close', () => {
				this.stopPing();
				this.socket = null;
				if (this.running) {
					this.emit('disconnected');
					this.scheduleReconnect();
				}
			});
		} catch (err) {
			this.emit('error', err instanceof Error ? err : new Error(String(err)));
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		if (!this.running || this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connectNow();
		}, this.backoffMs);
		this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
	}

	private startPing(): void {
		this.stopPing();
		this.pingTimer = setInterval(() => {
			this.send({ type: 'ping' });
		}, 30_000);
	}

	private stopPing(): void {
		if (this.pingTimer) {
			clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
	}

	private handleMessage(data: WebSocket.Data): void {
		let text: string;
		if (typeof data === 'string') {
			text = data;
		} else if (Buffer.isBuffer(data)) {
			text = data.toString('utf8');
		} else if (Array.isArray(data)) {
			text = Buffer.concat(data).toString('utf8');
		} else {
			text = Buffer.from(data).toString('utf8');
		}
		try {
			const frame = JSON.parse(text) as ServerMessage;
			this.emit('frame', frame);
		} catch (err) {
			this.emit('error', err instanceof Error ? err : new Error(`Invalid frame: ${text}`));
		}
	}
}
