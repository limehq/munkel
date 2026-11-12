import { afterEach, describe, expect, it } from 'bun:test';
import { normalizeCircleCode } from '../../core';
import { AppState } from '../session-store';
import type { GroupSession } from '../group-session';
import type { IdentityStore, PersistedState } from '../identity-store';

const JOIN_CODE = 'secret-join-circle-code-xyz';
const RESTORE_ONE = 'secret-restore-circle-one-abc';
const RESTORE_TWO = 'secret-restore-circle-two-def';
const FAIL_CODE = 'secret-restore-failure-ghi';
const LOCALHOST_CODE = 'secret-localhost-repair-jkl';
const RELAY_URL = 'ws://relay.invalid/ws';
const LOCALHOST_RELAY = 'ws://127.0.0.1:8787/ws';

function masked(code: string): string {
	return `${normalizeCircleCode(code).slice(0, 4)}…`;
}

function stubIdentityStore(overrides?: Partial<PersistedState>): IdentityStore {
	const state: PersistedState = {
		version: 1,
		memberId: 'stub-member-id-for-log-mask-tests',
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

function assertLogsMaskCodes(errorLogs: unknown[][], codes: string[]): void {
	const serialized = JSON.stringify(errorLogs);
	for (const code of codes) {
		const normalized = normalizeCircleCode(code);
		expect(serialized).not.toContain(normalized);
		expect(serialized).toContain(masked(code));
	}
}

describe('circle code log masking (#84)', () => {
	let appState: AppState | null = null;
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

	it('joinCircle logs only the 4-character mask in console.error', async () => {
		console.error = (...args: unknown[]) => {
			errorLogs.push(args);
		};

		const store = stubIdentityStore();
		appState = new AppState(store, () => {}, () => {}, undefined, {
			createSession: async (code) => stubSession(code),
		});

		await appState.joinCircle(JOIN_CODE, RELAY_URL);

		const joinLog = errorLogs.find((args) => args[0] === '[session] joinCircle');
		expect(joinLog).toBeDefined();
		const payload = JSON.parse(String(joinLog![1]));
		expect(payload.code).toBe(masked(JOIN_CODE));
		assertLogsMaskCodes(errorLogs, [JOIN_CODE]);
	});

	it('restoreCircles summary and join diagnostics never log full codes', async () => {
		console.error = (...args: unknown[]) => {
			errorLogs.push(args);
		};

		const store = stubIdentityStore({
			circles: [
				{ code: RESTORE_ONE, relayUrl: RELAY_URL, joinedAt: '2026-01-01T00:00:00.000Z' },
				{ code: RESTORE_TWO, relayUrl: RELAY_URL, joinedAt: '2026-01-02T00:00:00.000Z' },
			],
		});
		appState = new AppState(store, () => {}, () => {}, undefined, {
			createSession: async (code) => stubSession(code),
		});

		await appState.restoreCircles();

		const summaryLog = errorLogs.find((args) => args[0] === '[session] restoreCircles');
		expect(summaryLog).toBeDefined();
		const summary = JSON.parse(String(summaryLog![1]));
		expect(summary.circles).toEqual([
			{ code: masked(RESTORE_ONE), relayUrl: RELAY_URL },
			{ code: masked(RESTORE_TWO), relayUrl: RELAY_URL },
		]);
		assertLogsMaskCodes(errorLogs, [RESTORE_ONE, RESTORE_TWO]);
	});

	it('restoreCircles localhost relay repair logs a masked code', async () => {
		console.error = (...args: unknown[]) => {
			errorLogs.push(args);
		};

		const store = stubIdentityStore({
			circles: [
				{
					code: LOCALHOST_CODE,
					relayUrl: LOCALHOST_RELAY,
					joinedAt: '2026-01-01T00:00:00.000Z',
				},
			],
		});
		appState = new AppState(store, () => {}, () => {}, undefined, {
			createSession: async (code) => stubSession(code),
		});

		await appState.restoreCircles();

		const repairLog = errorLogs.find((args) => args[0] === '[session] repair localhost relayUrl → default');
		expect(repairLog).toBeDefined();
		const payload = JSON.parse(String(repairLog![1]));
		expect(payload.code).toBe(masked(LOCALHOST_CODE));
		assertLogsMaskCodes(errorLogs, [LOCALHOST_CODE]);
	});

	it('restoreCircles join failure logs a masked code', async () => {
		class RestoreFailureAppState extends AppState {
			override async joinCircle(code: string, relayUrl?: string): Promise<void> {
				if (normalizeCircleCode(code) === normalizeCircleCode(FAIL_CODE)) {
					throw new Error('injected failure');
				}
				return super.joinCircle(code, relayUrl);
			}
		}

		console.error = (...args: unknown[]) => {
			errorLogs.push(args);
		};

		const store = stubIdentityStore({
			circles: [{ code: FAIL_CODE, relayUrl: RELAY_URL, joinedAt: '2026-01-01T00:00:00.000Z' }],
		});
		appState = new RestoreFailureAppState(store, () => {}, () => {}, undefined, {
			createSession: async (code) => stubSession(code),
		});

		await appState.restoreCircles();

		const failureLog = errorLogs.find((args) => args[0] === '[session] restoreCircle failed');
		expect(failureLog).toBeDefined();
		const payload = JSON.parse(String(failureLog![1]));
		expect(payload.code).toBe(masked(FAIL_CODE));
		expect(payload.error).toBe('injected failure');
		assertLogsMaskCodes(errorLogs, [FAIL_CODE]);
	});
});
