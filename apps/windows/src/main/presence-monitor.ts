import type { IdentityStore } from './identity-store';
import type { AppState } from './session-store';
import type { PresenceStatus } from '../shared/types';

const AWAY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const IDLE_POLL_INTERVAL_MS = 30 * 1000; // 30 seconds

export interface IdleTimeSource {
	getIdleTimeMs(): number;
	onLock(cb: () => void): () => void;
	onUnlock(cb: () => void): () => void;
	onSuspend(cb: () => void): () => void;
	onResume(cb: () => void): () => void;
}

interface PresenceMonitorDependencies {
	idleSource: IdleTimeSource;
	identityStore: IdentityStore;
	sessionStore: AppState;
	onStatusChange?: (status: PresenceStatus) => void;
}

export class PresenceMonitor {
	localStatus: PresenceStatus;
	isAutoAway = false;
	private readonly idleSource: IdleTimeSource;
	private readonly identityStore: IdentityStore;
	private readonly sessionStore: AppState;
	private readonly onStatusChange?: (status: PresenceStatus) => void;
	private readonly pollTimer: ReturnType<typeof setInterval>;
	private readonly unsubscribeLock: () => void;
	private readonly unsubscribeUnlock: () => void;
	private readonly unsubscribeSuspend: () => void;
	private readonly unsubscribeResume: () => void;
	private lastEffectiveStatus: PresenceStatus;

	constructor(deps: PresenceMonitorDependencies) {
		this.idleSource = deps.idleSource;
		this.identityStore = deps.identityStore;
		this.sessionStore = deps.sessionStore;
		this.onStatusChange = deps.onStatusChange;
		this.localStatus = deps.identityStore.load().presenceStatus ?? 'online';
		this.lastEffectiveStatus = this.effectiveStatus;

		this.pollTimer = setInterval(() => this.pollIdle(), IDLE_POLL_INTERVAL_MS);
		this.unsubscribeLock = this.idleSource.onLock(() => this.enterAutoAway());
		this.unsubscribeUnlock = this.idleSource.onUnlock(() => this.pollIdle());
		this.unsubscribeSuspend = this.idleSource.onSuspend(() => this.enterAutoAway());
		this.unsubscribeResume = this.idleSource.onResume(() => this.pollIdle());
	}

	get effectiveStatus(): PresenceStatus {
		return this.localStatus === 'online' && this.isAutoAway ? 'away' : this.localStatus;
	}

	chooseStatus(status: PresenceStatus): void {
		const clearedAutoAway = this.isAutoAway;
		this.isAutoAway = false;
		if (this.localStatus !== status) {
			this.localStatus = status;
			this.identityStore.patch({ presenceStatus: status });
			this.sessionStore.setPresenceStatus(status);
		} else if (clearedAutoAway) {
			this.applyPresence();
		}
		// If the new explicit status is not online, auto-away must not override it.
		if (status !== 'online') {
			this.isAutoAway = false;
		}
		this.applyPresence();
	}

	pollIdle(): void {
		if (this.localStatus !== 'online') {
			this.setAutoAway(false);
			return;
		}
		const idleMs = this.idleSource.getIdleTimeMs();
		this.setAutoAway(idleMs >= AWAY_THRESHOLD_MS);
	}

	private enterAutoAway(): void {
		if (this.localStatus !== 'online') return;
		this.setAutoAway(true);
	}

	private setAutoAway(value: boolean): void {
		if (this.isAutoAway === value) return;
		this.isAutoAway = value;
		this.applyPresence();
	}

	private applyPresence(): void {
		const status = this.effectiveStatus;
		if (status === this.lastEffectiveStatus) return;
		this.lastEffectiveStatus = status;
		this.sessionStore.setLocalPresenceStatus(status);
		this.onStatusChange?.(status);
	}

	dispose(): void {
		clearInterval(this.pollTimer);
		this.unsubscribeLock();
		this.unsubscribeUnlock();
		this.unsubscribeSuspend();
		this.unsubscribeResume();
	}
}
