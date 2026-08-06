import { describe, expect, it, afterEach } from 'bun:test';
import { AppState } from '../session-store';
import type { IdentityStore, PersistedState } from '../identity-store';
import { deriveGroupKeys, sealRaw } from '../../core';

/**
 * Minimal in-memory stand-in for `IdentityStore`, so these tests exercise
 * `AppState`'s dev-echo-broadcasts logic (Plan 13 item 6) without touching
 * disk or a real relay connection — `joinCircle`/GroupSession wiring is
 * covered separately by group-session.test.ts's echo tests, which construct
 * a `GroupSession` directly with a `shouldEchoBroadcasts` stub.
 */
function stubIdentityStore(overrides?: Partial<PersistedState>): {
	store: IdentityStore;
	patches: Array<Partial<PersistedState>>;
} {
	const patches: Array<Partial<PersistedState>> = [];
	const state: PersistedState = {
		version: 1,
		memberId: 'stub-member',
		displayName: 'Stub User',
		circles: [],
		launchAtLogin: false,
		autoUpdateCheck: true,
		paletteHotkey: 'Ctrl+Shift+M',
		allowInScreenshots: false,
		devEchoBroadcasts: true,
		...overrides,
	};
	return {
		patches,
		store: {
			load: () => state,
			save: () => {},
			patch: (fields: Partial<PersistedState>) => {
				patches.push(fields);
				Object.assign(state, fields);
			},
			addCircle: () => {},
			removeCircle: () => {},
		} as unknown as IdentityStore,
	};
}

function noop() {}

describe('AppState.getDevEchoBroadcasts (Plan 13 item 6)', () => {
	it('is false when constructed without isDev, regardless of the persisted value', () => {
		const { store } = stubIdentityStore({ devEchoBroadcasts: true });
		const appState = new AppState(store, noop, noop);
		expect(appState.getDevEchoBroadcasts()).toBe(false);
	});

	// Packaged-build security invariant: main.ts computes `isDev = !app.isPackaged`,
	// so a shipped release always passes `{ isDev: false }`. Even a dev-populated
	// state.json (devEchoBroadcasts: true) copied into a packaged build's userData
	// folder must never let the release echo the user's own broadcasts.
	it('is false when isDev is explicitly false (packaged build) even with a dev-populated state.json', () => {
		const { store } = stubIdentityStore({ devEchoBroadcasts: true });
		const appState = new AppState(store, noop, noop, undefined, { isDev: false });
		expect(appState.getDevEchoBroadcasts()).toBe(false);
	});

	it('is false when isDev is true but the persisted value is false', () => {
		const { store } = stubIdentityStore({ devEchoBroadcasts: false });
		const appState = new AppState(store, noop, noop, undefined, { isDev: true });
		expect(appState.getDevEchoBroadcasts()).toBe(false);
	});

	it('is true only when both isDev and the persisted value are true', () => {
		const { store } = stubIdentityStore({ devEchoBroadcasts: true });
		const appState = new AppState(store, noop, noop, undefined, { isDev: true });
		expect(appState.getDevEchoBroadcasts()).toBe(true);
	});

	it('defaults to true (matching macOS DEBUG default) when isDev is true and nothing has overridden the persisted default', () => {
		const { store } = stubIdentityStore();
		const appState = new AppState(store, noop, noop, undefined, { isDev: true });
		expect(appState.getDevEchoBroadcasts()).toBe(true);
	});
});

describe('AppState.setDevEchoBroadcasts (Plan 13 item 6)', () => {
	it('persists the new value via identityStore.patch', () => {
		const { store, patches } = stubIdentityStore({ devEchoBroadcasts: true });
		const appState = new AppState(store, noop, noop, undefined, { isDev: true });

		appState.setDevEchoBroadcasts(false);

		expect(patches).toEqual([{ devEchoBroadcasts: false }]);
	});

	it('updates the effective value returned by getDevEchoBroadcasts when isDev is true', () => {
		const { store } = stubIdentityStore({ devEchoBroadcasts: false });
		const appState = new AppState(store, noop, noop, undefined, { isDev: true });
		expect(appState.getDevEchoBroadcasts()).toBe(false);

		appState.setDevEchoBroadcasts(true);

		expect(appState.getDevEchoBroadcasts()).toBe(true);
	});

	it('never surfaces true from getDevEchoBroadcasts when isDev is false, even after setDevEchoBroadcasts(true)', () => {
		// Defense in depth: main.ts's IPC handler is the primary gate (it
		// refuses to call this at all outside a dev build), but this proves
		// the effective value can't leak true even if that gate were bypassed.
		const { store } = stubIdentityStore({ devEchoBroadcasts: false });
		const appState = new AppState(store, noop, noop);

		appState.setDevEchoBroadcasts(true);

		expect(appState.getDevEchoBroadcasts()).toBe(false);
	});

	it('still persists the requested value even while isDev is false, so a later dev build sees the preference', () => {
		const { store, patches } = stubIdentityStore({ devEchoBroadcasts: false });
		const appState = new AppState(store, noop, noop);

		appState.setDevEchoBroadcasts(true);

		expect(patches).toEqual([{ devEchoBroadcasts: true }]);
	});

	it('coerces a non-boolean enabled value before persisting/effective-flagging', () => {
		const { store, patches } = stubIdentityStore({ devEchoBroadcasts: false });
		const appState = new AppState(store, noop, noop, undefined, { isDev: true });

		appState.setDevEchoBroadcasts('yes' as unknown as boolean);

		expect(patches).toEqual([{ devEchoBroadcasts: true }]);
		expect(appState.getDevEchoBroadcasts()).toBe(true);
	});
});

describe('AppState.loadFullImage (Plan 14 task 2)', () => {
	const originalFetch = globalThis.fetch;
	let joinedCode: string | null = null;
	let appStateToClean: AppState | null = null;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		if (joinedCode && appStateToClean) {
			appStateToClean.leaveCircle(joinedCode);
		}
		joinedCode = null;
		appStateToClean = null;
	});

	it('returns null when no session is joined for the (normalized) code', async () => {
		const { store } = stubIdentityStore();
		const appState = new AppState(store, noop, noop);

		expect(await appState.loadFullImage('  Some-Circle\n', 'any-key')).toBeNull();
	});

	it('delegates to the joined session and returns the decrypted bytes on success', async () => {
		const { store } = stubIdentityStore();
		const appState = new AppState(store, noop, noop);
		const code = 'preview-delegate-happy';
		joinedCode = code;
		appStateToClean = appState;

		await appState.joinCircle(code, 'ws://relay.invalid/ws');

		const { messageKey } = await deriveGroupKeys(code);
		const plaintext = new Uint8Array([10, 20, 30]);
		const sealed = await sealRaw(plaintext, messageKey);
		globalThis.fetch = (async () => new Response(sealed, { status: 200 })) as typeof fetch;

		const result = await appState.loadFullImage(code, 'r2-key-1');

		expect(result).toEqual(plaintext);
	});

	it('normalizes the code before looking the session up (case/whitespace-insensitive)', async () => {
		const { store } = stubIdentityStore();
		const appState = new AppState(store, noop, noop);
		const code = 'preview-delegate-normalize';
		joinedCode = code;
		appStateToClean = appState;

		await appState.joinCircle(code, 'ws://relay.invalid/ws');

		const { messageKey } = await deriveGroupKeys(code);
		const plaintext = new Uint8Array([1]);
		const sealed = await sealRaw(plaintext, messageKey);
		globalThis.fetch = (async () => new Response(sealed, { status: 200 })) as typeof fetch;

		const result = await appState.loadFullImage(`  ${code.toUpperCase()}\n`, 'r2-key-1');

		expect(result).toEqual(plaintext);
	});

	it('returns null once the circle has been left, instead of resurrecting a stale session', async () => {
		const { store } = stubIdentityStore();
		const appState = new AppState(store, noop, noop);
		const code = 'preview-delegate-left';

		await appState.joinCircle(code, 'ws://relay.invalid/ws');
		appState.leaveCircle(code);

		expect(await appState.loadFullImage(code, 'any-key')).toBeNull();
	});
});
