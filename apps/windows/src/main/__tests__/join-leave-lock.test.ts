import { afterEach, describe, expect, it } from 'bun:test';
import { normalizeCircleCode } from '../../core';
import { AppState } from '../session-store';
import type { GroupSession } from '../group-session';
import type { IdentityStore, PersistedState } from '../identity-store';

const CODE = 'join-leave-lock-race';
const RELAY_URL = 'ws://relay.invalid/ws';

function defer<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function trackingIdentityStore(overrides?: Partial<PersistedState>): {
	store: IdentityStore;
	state: PersistedState;
	added: string[];
	removed: string[];
} {
	const added: string[] = [];
	const removed: string[] = [];
	const state: PersistedState = {
		version: 1,
		memberId: 'stub-member',
		displayName: 'Stub User',
		circles: [],
		launchAtLogin: false,
		autoUpdateCheck: true,
		paletteHotkey: 'Ctrl+Shift+M',
		allowInScreenshots: false,
		devEchoBroadcasts: false,
		...overrides,
	};
	return {
		added,
		removed,
		state,
		store: {
			load: () => state,
			save: () => {},
			patch: (fields: Partial<PersistedState>) => {
				Object.assign(state, fields);
			},
			addCircle: (code: string, relayUrl: string) => {
				added.push(code);
				const normalized = normalizeCircleCode(code);
				if (!state.circles.some((c) => c.code === normalized)) {
					state.circles.push({
						code: normalized,
						relayUrl,
						joinedAt: new Date().toISOString(),
					});
				}
			},
			removeCircle: (code: string) => {
				removed.push(code);
				const normalized = normalizeCircleCode(code);
				state.circles = state.circles.filter((c) => c.code !== normalized);
			},
		} as unknown as IdentityStore,
	};
}

function stubSession(code: string): GroupSession {
	return {
		code: normalizeCircleCode(code),
		connect: () => {},
		disconnect: () => {},
		toState: () => ({
			code: normalizeCircleCode(code),
			members: [],
			isConnected: false,
			colorIndex: 0,
		}),
	} as unknown as GroupSession;
}

describe('AppState join/leave lock (#86)', () => {
	let appState: AppState | null = null;

	afterEach(async () => {
		if (appState) {
			for (const circle of appState.getState().circles) {
				await appState.leaveCircle(circle.code);
			}
		}
		appState = null;
	});

	it('leave during in-flight create does not resurrect session or persistence', async () => {
		const createGate = defer<void>();
		const { store, state, added } = trackingIdentityStore();
		let createStarted = false;

		appState = new AppState(store, () => {}, () => {}, undefined, {
			createSession: async (code) => {
				createStarted = true;
				await createGate.promise;
				return stubSession(code);
			},
		});

		const normalized = normalizeCircleCode(CODE);
		const joinDone = appState.joinCircle(CODE, RELAY_URL);
		await Promise.resolve();
		expect(createStarted).toBe(true);

		const leaveDone = appState.leaveCircle(CODE);
		createGate.resolve(undefined);

		await joinDone;
		await leaveDone;

		expect(appState.getState().circles).toEqual([]);
		expect(state.circles).toEqual([]);
		expect(added).toEqual([]);
	});

	it('setRelayUrl then leave while rejoin create is in flight stays left', async () => {
		const createGate = defer<void>();
		const { store, state } = trackingIdentityStore();
		let createCount = 0;

		appState = new AppState(store, () => {}, () => {}, undefined, {
			createSession: async (code) => {
				createCount += 1;
				if (createCount === 1) {
					return stubSession(code);
				}
				await createGate.promise;
				return stubSession(code);
			},
		});

		await appState.joinCircle(CODE, RELAY_URL);
		expect(appState.getState().circles).toHaveLength(1);

		const relayDone = appState.setRelayUrl(CODE, 'ws://relay.other/ws');
		await Promise.resolve();
		expect(createCount).toBe(2);

		const leaveDone = appState.leaveCircle(CODE);
		createGate.resolve(undefined);

		await relayDone;
		await leaveDone;

		expect(appState.getState().circles).toEqual([]);
		expect(state.circles).toEqual([]);
	});
});
