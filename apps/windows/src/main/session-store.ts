import { normalizeCircleCode } from '../core';
import { IdentityStore } from './identity-store';
import { GroupSession, type SendResult } from './group-session';
import type { CircleState, IdentityState, NotchMessage, PresenceStatus, StateUpdate } from '../shared/types';

// Relay endpoint. Defaults to PRODUCTION in all builds so fresh joins (incl.
// dev) reach real peers. Point at a local `wrangler dev` relay by setting
// MUNKEL_RELAY_URL=ws://127.0.0.1:8787. The old dev-only localhost default
// silently pinned dev circles to a dead relay → never online (presence bug H-A).
const DEFAULT_RELAY_URL = process.env.MUNKEL_RELAY_URL ?? 'wss://relay.munkel.app';

export type { StateUpdate, CircleState } from '../shared/types';

interface IdentityUpdate {
	displayName: string;
	avatar?: string;
	githubLogin?: string;
}

export class AppState {
	private readonly sessions = new Map<string, GroupSession>();
	private readonly joinLocks = new Map<string, Promise<void>>();
	private identity: IdentityState;
	private profileTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly identityStore: IdentityStore,
		private readonly onBroadcast: (update: StateUpdate) => void,
		private readonly onNotch: (message: NotchMessage) => void,
		private readonly onRelayError?: (message: string) => void,
	) {
		const persisted = identityStore.load();
		const presenceStatus = persisted.presenceStatus ?? 'online';
		this.identity = {
			memberId: persisted.memberId,
			displayName: persisted.displayName,
			avatar: persisted.avatar,
			githubLogin: persisted.githubLogin,
			presenceStatus,
			effectiveStatus: presenceStatus,
		};
	}

	async joinCircle(code: string, relayUrl?: string): Promise<void> {
		const normalized = normalizeCircleCode(code);

		// Serialize join attempts for the same circle so parallel callers
		// (restoreCircles, setRelayUrl, CLI/Renderer) never create duplicate
		// sessions or race on the identity-store persist step. If a previous
		// attempt failed, wait for it to finish and then try ourselves.
		while (this.joinLocks.has(normalized)) {
			await this.joinLocks.get(normalized);
		}
		if (this.sessions.has(normalized)) {
			return;
		}

		let releaseLock: () => void;
		const lock = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		this.joinLocks.set(normalized, lock);

		try {
			const persisted = this.identityStore.load().circles.find((c) => c.code === normalized);
			const url = relayUrl ?? persisted?.relayUrl ?? DEFAULT_RELAY_URL;
			// Phase-0 diagnostics (presence bug): make the chosen relay URL + member
			// visible so we can tell a dead-localhost dev join (H-A) from a real
			// connect failure, and confirm which memberId this client actually uses.
			console.error(
				'[session] joinCircle',
				JSON.stringify({ code: normalized, relayUrl: url, memberId: `${this.identity.memberId.slice(0, 8)}…` }),
			);

			const session = await GroupSession.create(normalized, url, this.identity.memberId, this.identity, {
				onStateChange: () => this.broadcast(),
				onNotch: (message) => this.onNotch(message),
				onError: (message) => this.onRelayError?.(message),
				getColorIndex: () => {
					// Read at call time so the color follows the live joined
					// order after `leaveCircle` / `setRelayUrl`.
					return this.getState().circles.findIndex((c) => c.code === normalized);
				},
			});

			this.sessions.set(normalized, session);
			this.identityStore.addCircle(normalized, url);
			session.connect();
			this.broadcast();
		} finally {
			this.joinLocks.delete(normalized);
			releaseLock!();
		}
	}

	leaveCircle(code: string): void {
		const normalized = normalizeCircleCode(code);
		const session = this.sessions.get(normalized);
		if (session) {
			session.disconnect();
			this.sessions.delete(normalized);
		}
		this.identityStore.removeCircle(normalized);
		this.broadcast();
	}

	async sendChat(code: string, text: string, to?: string): Promise<SendResult> {
		const normalized = normalizeCircleCode(code);
		const session = this.sessions.get(normalized);
		if (!session) {
			return { ok: false, error: 'Circle offline — message not sent.' };
		}
		return session.sendChat(text, to);
	}

	async sendImages(code: string, paths: string[], caption: string, to?: string): Promise<SendResult> {
		const normalized = normalizeCircleCode(code);
		const session = this.sessions.get(normalized);
		if (!session) {
			return { ok: false, error: 'Circle offline — message not sent.' };
		}
		return session.sendImages(paths, caption, to);
	}

	async fetchFullImage(
		code: string,
		r2Key: string,
	): Promise<{ ok: true; data: Uint8Array; mime: string } | { ok: false; error: string }> {
		const normalized = normalizeCircleCode(code);
		const session = this.sessions.get(normalized);
		if (!session) {
			return { ok: false, error: 'Circle offline' };
		}
		const mime = session.findImageMime(r2Key) ?? 'image/avif';
		try {
			const data = await session.fetchFullImage(r2Key);
			return { ok: true, data, mime };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	}

	updateIdentity(next: IdentityUpdate): void {
		this.identity = { ...this.identity, ...next };
		this.identityStore.patch(next);
		for (const session of this.sessions.values()) {
			session.updateIdentity(this.identity);
		}
		this.broadcast();
		if (this.profileTimer) clearTimeout(this.profileTimer);
		this.profileTimer = setTimeout(() => {
			this.profileTimer = null;
			void this.broadcastProfiles();
		}, 1000);
	}

	setPresenceStatus(status: PresenceStatus): void {
		if (this.identity.presenceStatus === status) return;
		this.identity = { ...this.identity, presenceStatus: status };
		this.identityStore.patch({ presenceStatus: status });
		this.broadcast();
	}

	setLocalPresenceStatus(status: PresenceStatus): void {
		if (this.identity.effectiveStatus === status) return;
		this.identity = { ...this.identity, effectiveStatus: status };
		this.broadcast();
	}

	broadcastPresenceStatus(status: PresenceStatus): void {
		for (const session of this.sessions.values()) {
			void session.broadcastPresence(status);
		}
	}

	getIdentity(): IdentityState {
		return this.identity;
	}

	flushProfileBroadcast(): void {
		if (this.profileTimer) {
			clearTimeout(this.profileTimer);
			this.profileTimer = null;
		}
		void this.broadcastProfiles();
	}

	async setRelayUrl(code: string, relayUrl: string): Promise<void> {
		const normalized = normalizeCircleCode(code);

		// Wait for any in-flight join for this circle to finish before we tear
		// it down. Without this, joinCircle could see the old session, recreate
		// it, or race with the deletion below.
		const existingLock = this.joinLocks.get(normalized);
		if (existingLock) {
			await existingLock;
		}

		const hadSession = this.sessions.get(normalized);
		if (hadSession) {
			hadSession.disconnect();
			this.sessions.delete(normalized);
		}
		this.identityStore.addCircle(normalized, relayUrl);
		await this.joinCircle(normalized, relayUrl);
	}

	getState(): StateUpdate {
		return {
			identity: this.identity,
			circles: Array.from(this.sessions.values()).map((session) => session.toState()),
		};
	}

	async restoreCircles(): Promise<void> {
		const circles = this.identityStore.load().circles;
		// Phase-0 diagnostics (presence bug): prove whether the persisted circles
		// were actually loaded (H-D). "0 external connections" is explained by
		// "0 circles loaded" just as much as by a connect failure.
		console.error(
			'[session] restoreCircles',
			JSON.stringify({
				count: circles.length,
				circles: circles.map((c) => ({ code: c.code, relayUrl: c.relayUrl })),
			}),
		);
		for (const circle of circles) {
			// Heal circles persisted against a dead localhost dev relay (H-A):
			// repoint them at the current default so they can actually connect.
			// joinCircle persists the corrected URL. No-op when the default is
			// itself localhost (intentional local-relay dev via MUNKEL_RELAY_URL).
			const relayUrl = /(?:127\.0\.0\.1|localhost)/.test(circle.relayUrl)
				? DEFAULT_RELAY_URL
				: circle.relayUrl;
			if (relayUrl !== circle.relayUrl) {
				console.error(
					'[session] repair localhost relayUrl → default',
					JSON.stringify({ code: circle.code, from: circle.relayUrl, to: relayUrl }),
				);
			}
			await this.joinCircle(circle.code, relayUrl);
		}
	}

	broadcast(): void {
		this.onBroadcast(this.getState());
	}

	private broadcastProfiles(): void {
		for (const session of this.sessions.values()) {
			void session.sendProfile();
		}
	}
}
