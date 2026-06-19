import { normalizeCircleCode } from '@munkel/core';
import { IdentityStore } from './identity-store';
import { GroupSession } from './group-session';
import { ProfileBroadcaster } from './profile-broadcaster';
import type { CircleState, IdentityState, NotchMessage, StateUpdate } from '../shared/types';

const DEFAULT_RELAY_URL =
	process.env.NODE_ENV === 'development' ? 'ws://127.0.0.1:8787' : 'wss://relay.munkel.app';

export type { StateUpdate, CircleState } from '../shared/types';

export class AppState {
	private readonly sessions = new Map<string, GroupSession>();
	private identity: IdentityState;
	private readonly broadcaster: ProfileBroadcaster;

	constructor(
		private readonly identityStore: IdentityStore,
		private readonly onBroadcast: (update: StateUpdate) => void,
		private readonly onNotch: (message: NotchMessage) => void,
		private readonly onRelayError?: (message: string) => void,
	) {
		const persisted = identityStore.load();
		this.identity = {
			memberId: persisted.memberId,
			displayName: persisted.displayName,
			avatar: persisted.avatar,
		};
		this.broadcaster = new ProfileBroadcaster(() => this.broadcastProfiles());
	}

	async joinCircle(code: string, relayUrl?: string): Promise<void> {
		const normalized = normalizeCircleCode(code);
		if (this.sessions.has(normalized)) {
			return;
		}

		const persisted = this.identityStore.load().circles.find((c) => c.code === normalized);
		const url = relayUrl ?? persisted?.relayUrl ?? DEFAULT_RELAY_URL;

		const session = await GroupSession.create(normalized, url, this.identity.memberId, this.identity, {
			onStateChange: () => this.broadcast(),
			onChat: () => {
				// Intentionally empty: chat log UI is not implemented yet.
			},
			onNotch: (message) => this.onNotch(message),
			onError: (message) => this.onRelayError?.(message),
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

	async sendChat(code: string, text: string, to?: string): Promise<boolean> {
		const normalized = normalizeCircleCode(code);
		const session = this.sessions.get(normalized);
		if (!session) {
			return false;
		}
		return session.sendChat(text, to);
	}

	updateIdentity(displayName: string, avatar?: string): void {
		this.identity = { ...this.identity, displayName, avatar };
		this.identityStore.patch({ displayName, avatar });
		for (const session of this.sessions.values()) {
			session.updateIdentity(this.identity);
		}
		this.broadcast();
		this.broadcaster.trigger();
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
		for (const circle of circles) {
			await this.joinCircle(circle.code, circle.relayUrl);
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
