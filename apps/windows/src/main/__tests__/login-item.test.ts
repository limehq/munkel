import { describe, expect, it } from 'bun:test';
import {
	applyLaunchAtLogin,
	setLaunchAtLoginPreference,
	type LaunchAtLoginStore,
	type LoginItemApp,
} from '../login-item';

function mockApp(options?: { isPackaged?: boolean; throws?: boolean }): {
	app: LoginItemApp;
	calls: Array<{ openAtLogin: boolean }>;
} {
	const calls: Array<{ openAtLogin: boolean }> = [];
	return {
		calls,
		app: {
			isPackaged: options?.isPackaged ?? true,
			setLoginItemSettings: (settings) => {
				if (options?.throws) throw new Error('not supported in this environment');
				calls.push(settings);
			},
		},
	};
}

function mockStore(): { store: LaunchAtLoginStore; patches: Array<{ launchAtLogin: boolean }> } {
	const patches: Array<{ launchAtLogin: boolean }> = [];
	return {
		patches,
		store: {
			patch: (fields) => {
				patches.push(fields);
			},
		},
	};
}

describe('applyLaunchAtLogin', () => {
	it('calls setLoginItemSettings({ openAtLogin: true }) when enabling in a packaged build', () => {
		const { app, calls } = mockApp();
		const result = applyLaunchAtLogin(app, true);
		expect(result).toBe(true);
		expect(calls).toEqual([{ openAtLogin: true }]);
	});

	it('calls setLoginItemSettings({ openAtLogin: false }) when disabling in a packaged build', () => {
		const { app, calls } = mockApp();
		const result = applyLaunchAtLogin(app, false);
		expect(result).toBe(true);
		expect(calls).toEqual([{ openAtLogin: false }]);
	});

	it('returns false and does not throw when Electron throws (sandboxed/portable install)', () => {
		const { app } = mockApp({ throws: true });

		let threw = false;
		let result = true;
		try {
			result = applyLaunchAtLogin(app, true);
		} catch {
			threw = true;
		}

		expect(threw).toBe(false);
		expect(result).toBe(false);
	});

	it('skips the OS call entirely in unpackaged (dev) builds but reports success', () => {
		// Registering in dev would autostart the bare electron.exe dev shell,
		// not Munkel — the call must never reach setLoginItemSettings. The skip
		// counts as success so the persisted preference / checkbox do not snap
		// back confusingly in dev.
		const { app, calls } = mockApp({ isPackaged: false });
		const result = applyLaunchAtLogin(app, true);
		expect(result).toBe(true);
		expect(calls).toEqual([]);
	});

	it('also skips the OS call in dev when disabling', () => {
		const { app, calls } = mockApp({ isPackaged: false });
		const result = applyLaunchAtLogin(app, false);
		expect(result).toBe(true);
		expect(calls).toEqual([]);
	});
});

describe('setLaunchAtLoginPreference', () => {
	it('applies the OS setting and persists the choice on success', () => {
		const { app, calls } = mockApp();
		const { store, patches } = mockStore();

		const ok = setLaunchAtLoginPreference(app, store, true);

		expect(ok).toBe(true);
		expect(calls).toEqual([{ openAtLogin: true }]);
		expect(patches).toEqual([{ launchAtLogin: true }]);
	});

	it('does NOT persist when the OS call throws, and returns false for the renderer snap-back', () => {
		const { app } = mockApp({ throws: true });
		const { store, patches } = mockStore();

		const ok = setLaunchAtLoginPreference(app, store, true);

		expect(ok).toBe(false);
		expect(patches).toEqual([]);
	});

	it('persists the preference in dev builds even though the OS call is skipped', () => {
		const { app, calls } = mockApp({ isPackaged: false });
		const { store, patches } = mockStore();

		const ok = setLaunchAtLoginPreference(app, store, true);

		expect(ok).toBe(true);
		expect(calls).toEqual([]);
		expect(patches).toEqual([{ launchAtLogin: true }]);
	});

	it('coerces a non-boolean enabled value from IPC to a strict boolean before applying/persisting', () => {
		const { app, calls } = mockApp();
		const { store, patches } = mockStore();

		setLaunchAtLoginPreference(app, store, 'yes' as unknown);
		setLaunchAtLoginPreference(app, store, 0 as unknown);

		expect(calls).toEqual([{ openAtLogin: true }, { openAtLogin: false }]);
		expect(patches).toEqual([{ launchAtLogin: true }, { launchAtLogin: false }]);
	});
});
