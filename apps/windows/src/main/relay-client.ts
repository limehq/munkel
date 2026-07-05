import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '../core';

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
	/** Same as `url` but with the member UUID masked, safe to log. */
	private readonly logUrl: string;
	private readonly groupId: string;
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
		const base = relayUrl.replace(/\/$/, '');
		this.groupId = groupId;
		this.url = `${base}/ws?group=${groupId}&member=${memberId}`;
		this.logUrl = `${base}/ws?group=${groupId}&member=${memberId.slice(0, 8)}…`;
		this.createWebSocket = options?.createWebSocket ?? ((url) => new WebSocket(url));
	}

	/**
	 * Structured stderr logging (no npm dep). Visible in the dev terminal
	 * because `dev.mjs` inherits stdio, so the relay connection lifecycle is
	 * diagnosable — the whole point of Phase 0 for the presence bug.
	 */
	private log(event: string, data: Record<string, unknown> = {}): void {
		try {
			console.error(`[relay] ${event}`, JSON.stringify({ url: this.logUrl, ...data }));
		} catch {
			// Never let logging break the socket lifecycle.
		}
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
		this.log('connecting');

		try {
			const socket = this.createWebSocket(this.url);
			this.socket = socket;

			socket.on('open', () => {
				this.log('open');
				this.backoffMs = 1000;
				this.startPing();
			});

			socket.on('message', (data) => {
				this.handleMessage(data);
			});

			socket.on('error', (err: Error) => {
				this.log('socket-error', { message: err.message });
				this.emit('error', err);
				// `ws` can emit 'error' WITHOUT a following 'close'. If we only
				// reconnected from the close handler (the old behaviour) the client
				// could stall forever holding a dead, non-open socket with no retry
				// scheduled — a silent-offline root-cause candidate (H-C).
				this.handleConnectionLost(socket);
			});

			socket.on('close', (code?: number, reason?: Buffer) => {
				const closeInfo = { code, reason: reason?.toString() };
				this.log('close', { groupId: this.groupId, ...closeInfo });
				this.handleConnectionLost(socket, closeInfo);
			});
		} catch (err) {
			this.log('connect-threw', {
				message: err instanceof Error ? err.message : String(err),
			});
			this.emit('error', err instanceof Error ? err : new Error(String(err)));
			this.scheduleReconnect();
		}
	}

	/**
	 * Idempotently transition to "reconnecting" for `socket`. Safe to call from
	 * BOTH the 'error' and 'close' handlers (and if both fire): the current-socket
	 * guard runs the teardown + a single `scheduleReconnect` exactly once per
	 * socket, and `scheduleReconnect` is itself a no-op while a timer is armed.
	 */
	private handleConnectionLost(
		socket: WebSocket,
		closeInfo: { code?: number; reason?: string } = {},
	): void {
		if (this.socket !== socket) return; // already handled or superseded
		this.socket = null;
		this.stopPing();
		try {
			socket.terminate();
		} catch {
			// Socket may already be closed; terminate is best-effort cleanup.
		}
		if (this.running) {
			this.emit('disconnected');
			this.log('reconnect', {
				groupId: this.groupId,
				code: closeInfo.code,
				reason: closeInfo.reason,
				backoffMs: this.backoffMs,
			});
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
