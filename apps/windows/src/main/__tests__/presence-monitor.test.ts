import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PresenceMonitor, type IdleTimeSource } from '../presence-monitor';
import { IdentityStore } from '../identity-store';
import type { AppState } from '../session-store';
import type { PresenceStatus, StateUpdate } from '../../shared/types';

class FakeIdleTimeSource implements IdleTimeSource {
	private idleMs = 0;
	private readonly lockCbs = new Set<() => void>();
	private readonly unlockCbs = new Set<() => void>();
	private readonly suspendCbs = new Set<() => void>();
	private readonly resumeCbs = new Set<() => void>();

	getIdleTimeMs(): number {
		return this.idleMs;
	}

	setIdleTimeMs(ms: number): void {
		this.idleMs = ms;
	}

	onLock(cb: () => void): () => void {
		this.lockCbs.add(cb);
		return () => this.lockCbs.delete(cb);
	}

	onUnlock(cb: () => void): () => void {
		this.unlockCbs.add(cb);
		return () => this.unlockCbs.delete(cb);
	}

	onSuspend(cb: () => void): () => void {
		this.suspendCbs.add(cb);
		return () => this.suspendCbs.delete(cb);
	}

	onResume(cb: () => void): () => void {
		this.resumeCbs.add(cb);
		return () => this.resumeCbs.delete(cb);
	}

	lock(): void {
		for (const cb of this.lockCbs) cb();
	}

	unlock(): void {
		for (const cb of this.unlockCbs) cb();
	}

	suspend(): void {
		for (const cb of this.suspendCbs) cb();
	}

	resume(): void {
		for (const cb of this.resumeCbs) cb();
	}
}

function fakeAppState(): AppState & {
	localPresenceStatus: PresenceStatus | undefined;
	effectivePresenceStatus: PresenceStatus | undefined;
	broadcasts: PresenceStatus[];
} {
	return {
		localPresenceStatus: undefined,
		effectivePresenceStatus: undefined,
		broadcasts: [],
		setPresenceStatus(status) {
			this.localPresenceStatus = status;
		},
		setLocalPresenceStatus(status) {
			this.effectivePresenceStatus = status;
		},
		broadcastPresenceStatus(status) {
			this.broadcasts.push(status);
		},
	} as AppState & {
		localPresenceStatus: PresenceStatus | undefined;
		effectivePresenceStatus: PresenceStatus | undefined;
		broadcasts: PresenceStatus[];
	};
}

describe('PresenceMonitor', () => {
	let tempDir: string;
	let identityStore: IdentityStore;
	let idleSource: FakeIdleTimeSource;
	let sessionStore: ReturnType<typeof fakeAppState>;
	let monitor: PresenceMonitor | null = null;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'munkel-presence-monitor-'));
		identityStore = new IdentityStore(tempDir);
		idleSource = new FakeIdleTimeSource();
		sessionStore = fakeAppState();
	});

	afterEach(async () => {
		monitor?.dispose();
		monitor = null;
		await rm(tempDir, { recursive: true, force: true });
	});

	function createMonitor(onStatusChange?: (status: PresenceStatus) => void): PresenceMonitor {
		monitor = new PresenceMonitor({ idleSource, identityStore, sessionStore, onStatusChange });
		return monitor;
	}

	it('starts online and reflects the initial effective status', () => {
		createMonitor();
		expect(monitor!.localStatus).toBe('online');
		expect(monitor!.effectiveStatus).toBe('online');
	});

	it('loads persisted local status', () => {
		identityStore.patch({ presenceStatus: 'dnd' });
		createMonitor();
		expect(monitor!.localStatus).toBe('dnd');
		expect(monitor!.effectiveStatus).toBe('dnd');
	});

	it('does not promote dnd to away when idle', () => {
		identityStore.patch({ presenceStatus: 'dnd' });
		createMonitor();
		idleSource.setIdleTimeMs(10 * 60 * 1000);
		monitor!.pollIdle();
		expect(monitor!.effectiveStatus).toBe('dnd');
	});

	it('promotes online to away after 5 minutes idle', () => {
		const changes: PresenceStatus[] = [];
		createMonitor((status) => changes.push(status));
		idleSource.setIdleTimeMs(5 * 60 * 1000);
		monitor!.pollIdle();
		expect(monitor!.effectiveStatus).toBe('away');
		expect(sessionStore.effectivePresenceStatus).toBe('away');
		expect(changes).toContain('away');
	});

	it('clears auto-away when clicking online while auto-away', () => {
		createMonitor();
		idleSource.setIdleTimeMs(5 * 60 * 1000);
		monitor!.pollIdle();
		expect(monitor!.effectiveStatus).toBe('away');

		monitor!.chooseStatus('online');
		expect(monitor!.isAutoAway).toBe(false);
		expect(monitor!.effectiveStatus).toBe('online');
		expect(sessionStore.effectivePresenceStatus).toBe('online');
	});

	it('sets explicit away and clears auto-away flag', () => {
		createMonitor();
		monitor!.chooseStatus('away');
		expect(monitor!.localStatus).toBe('away');
		expect(monitor!.isAutoAway).toBe(false);
		expect(monitor!.effectiveStatus).toBe('away');
		expect(identityStore.load().presenceStatus).toBe('away');
	});

	it('forces away immediately on lock', () => {
		createMonitor();
		idleSource.lock();
		expect(monitor!.effectiveStatus).toBe('away');
	});

	it('forces away immediately on suspend', () => {
		createMonitor();
		idleSource.suspend();
		expect(monitor!.effectiveStatus).toBe('away');
	});

	it('re-evaluates idle on unlock and returns online when active', () => {
		createMonitor();
		idleSource.setIdleTimeMs(5 * 60 * 1000);
		monitor!.pollIdle();
		expect(monitor!.effectiveStatus).toBe('away');

		idleSource.setIdleTimeMs(0);
		idleSource.unlock();
		expect(monitor!.effectiveStatus).toBe('online');
	});

	it('re-evaluates idle on resume and returns online when active', () => {
		createMonitor();
		idleSource.suspend();
		expect(monitor!.effectiveStatus).toBe('away');

		idleSource.setIdleTimeMs(0);
		idleSource.resume();
		expect(monitor!.effectiveStatus).toBe('online');
	});

	it('does not broadcast when effective status is unchanged', () => {
		createMonitor();
		const initialLength = sessionStore.broadcasts.length;
		monitor!.pollIdle();
		expect(sessionStore.broadcasts.length).toBe(initialLength);
	});
});
