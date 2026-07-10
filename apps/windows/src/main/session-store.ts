import { normalizeCircleCode } from '../core';
import { IdentityStore } from './identity-store';
import { GroupSession, type SendResult } from './group-session';
import type { CircleState, IdentityState, NotchMessage, StateUpdate } from '../shared/types';

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
	private identity: IdentityState;
	private profileTimer: ReturnType<typeof setTimeout> | null = null;
	// Dev-only "echo my own broadcasts" (Plan 13 item 6), mirroring macOS
	// `AppModel`'s `#if DEBUG static var devEchoBroadcasts` (default `true`
	// in DEBUG; the code path does not exist at all outside it). `isDev` is
	// folded in once here — not re-checked per send — so a *packaged* build
	// launched against a dev-populated userData/state.json can never echo,
	// even though the persisted field may say `true`.
	private readonly isDev: boolean;
	private devEchoBroadcastsEnabled: boolean;

	constructor(
		private readonly identityStore: IdentityStore,
		private readonly onBroadcast: (update: StateUpdate) => void,
		private readonly onNotch: (message: NotchMessage) => void,
		private readonly onRelayError?: (message: string) => void,
		options?: { isDev?: boolean },
	) {
		const persisted = identityStore.load();
		this.identity = {
			memberId: persisted.memberId,
			displayName: persisted.displayName,
			avatar: persisted.avatar,
			githubLogin: persisted.githubLogin,
		};
		this.isDev = !!options?.isDev;
		this.devEchoBroadcastsEnabled = this.isDev && persisted.devEchoBroadcasts;
	}

	/** Current effective echo-my-broadcasts value — always `false` outside a dev build. */
	getDevEchoBroadcasts(): boolean {
		return this.devEchoBroadcastsEnabled;
	}

	/**
	 * Dev-only setter. Callers (the `set-dev-echo-broadcasts` IPC handler in
	 * main.ts) must gate reachability behind `isDev` themselves — this is a
	 * second, independent guard: even if called while `!this.isDev`, the
	 * effective value folds `this.isDev` back in and stays `false`.
	 */
	setDevEchoBroadcasts(enabled: boolean): void {
		const value = !!enabled;
		this.devEchoBroadcastsEnabled = this.isDev && value;
		this.identityStore.patch({ devEchoBroadcasts: value });
	}

	async joinCircle(code: string, relayUrl?: string): Promise<void> {
		const normalized = normalizeCircleCode(code);
		if (this.sessions.has(normalized)) {
			return;
		}

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
			// Dev-only broadcast echo (Plan 13 item 6) — read at call time (not
			// captured once) so a toggle flip during a live session takes
			// effect on the very next send.
			shouldEchoBroadcasts: () => this.devEchoBroadcastsEnabled,
		});

		this.sessions.set(normalized, session);
		this.identityStore.addCircle(normalized, url);
		session.connect();
		this.broadcast();
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
