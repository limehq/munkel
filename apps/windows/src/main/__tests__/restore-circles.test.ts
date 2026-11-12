import { afterEach, describe, expect, it } from 'bun:test';
import { normalizeCircleCode } from '../../core';
import { AppState } from '../session-store';
import type { IdentityStore, PersistedState } from '../identity-store';

const FAIL_CODE = 'fail-restore-circle-two';
const CODE_ONE = 'one-restore-circle-ok';
const CODE_THREE = 'three-restore-circle-ok';
const RELAY_URL = 'ws://relay.invalid/ws';

function stubIdentityStore(overrides?: Partial<PersistedState>): IdentityStore {
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
		load: () => state,
		save: () => {},
		patch: (fields: Partial<PersistedState>) => {
			Object.assign(state, fields);
		},
		addCircle: () => {},
		removeCircle: () => {},
	} as unknown as IdentityStore;
}

class RestoreTestAppState extends AppState {
	failOn = new Set<string>();
	joinCalls: string[] = [];

	override async joinCircle(code: string, relayUrl?: string): Promise<void> {
		const normalized = normalizeCircleCode(code);
		this.joinCalls.push(normalized);
		if (this.failOn.has(normalized)) {
			throw new Error('injected failure');
		}
		return super.joinCircle(code, relayUrl);
	}
}

describe('AppState.restoreCircles', () => {
	let appState: RestoreTestAppState | null = null;
	const originalConsoleError = console.error;
	const errorLogs: unknown[][] = [];

	afterEach(async () => {
		if (appState) {
			for (const circle of appState.getState().circles) {
				await appState.leaveCircle(circle.code);
			}
		}
		appState = null;
		errorLogs.length = 0;
		console.error = originalConsoleError;
	});

	it('continues after a failed join so the first and third circles still restore', async () => {
		console.error = (...args: unknown[]) => {
			errorLogs.push(args);
		};

		const store = stubIdentityStore({
			circles: [
				{ code: CODE_ONE, relayUrl: RELAY_URL, joinedAt: '2026-01-01T00:00:00.000Z' },
				{ code: FAIL_CODE, relayUrl: RELAY_URL, joinedAt: '2026-01-02T00:00:00.000Z' },
				{ code: CODE_THREE, relayUrl: RELAY_URL, joinedAt: '2026-01-03T00:00:00.000Z' },
			],
		});
		appState = new RestoreTestAppState(store, () => {}, () => {});
		appState.failOn.add(normalizeCircleCode(FAIL_CODE));

		await expect(appState.restoreCircles()).resolves.toBeUndefined();

		expect(appState.joinCalls).toEqual([
			normalizeCircleCode(CODE_ONE),
			normalizeCircleCode(FAIL_CODE),
			normalizeCircleCode(CODE_THREE),
		]);
		expect(appState.getState().circles.map((circle) => circle.code)).toEqual([
			normalizeCircleCode(CODE_ONE),
			normalizeCircleCode(CODE_THREE),
		]);

		const failureLog = errorLogs.find((args) => args[0] === '[session] restoreCircle failed');
		expect(failureLog).toBeDefined();
		const payload = JSON.parse(String(failureLog![1]));
		expect(payload.code).toBe(`${normalizeCircleCode(FAIL_CODE).slice(0, 4)}…`);
		expect(payload.error).toBe('injected failure');
		expect(JSON.stringify(errorLogs)).not.toContain(normalizeCircleCode(FAIL_CODE));
	});
});
