import { describe, expect, it } from 'bun:test';
import { applyLaunchAtLogin, type LoginItemApp } from '../login-item';

function mockApp(): { app: LoginItemApp; calls: Array<{ openAtLogin: boolean }> } {
	const calls: Array<{ openAtLogin: boolean }> = [];
	return {
		calls,
		app: {
			setLoginItemSettings: (settings) => {
				calls.push(settings);
			},
		},
	};
}

describe('applyLaunchAtLogin', () => {
	it('calls setLoginItemSettings({ openAtLogin: true }) when enabling', () => {
		const { app, calls } = mockApp();
		const result = applyLaunchAtLogin(app, true);
		expect(result).toBe(true);
		expect(calls).toEqual([{ openAtLogin: true }]);
	});

	it('calls setLoginItemSettings({ openAtLogin: false }) when disabling', () => {
		const { app, calls } = mockApp();
		const result = applyLaunchAtLogin(app, false);
		expect(result).toBe(true);
		expect(calls).toEqual([{ openAtLogin: false }]);
	});

	it('returns false and does not throw when Electron throws (sandboxed/portable install)', () => {
		const app: LoginItemApp = {
			setLoginItemSettings: () => {
				throw new Error('not supported in this environment');
			},
		};

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
});
