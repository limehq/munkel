import { describe, expect, it, beforeEach, afterEach, jest } from 'bun:test';
import { EventEmitter } from 'node:events';
import { initUpdateService, type UpdateSend } from '../update-service';
import type { UpdateState } from '../../shared/types';

class MockAppUpdater extends EventEmitter {
	logger: unknown = null;
	autoDownload = true;
	autoInstallOnAppQuit = false;

	checkForUpdates = () => Promise.resolve({} as unknown);
	quitAndInstall = (_isSilent: boolean, _runAfter?: boolean) => {};
}

function createMockUpdater() {
	const updater = new MockAppUpdater();
	const checkSpy = {
		calls: 0,
		wrap() {
			const original = updater.checkForUpdates.bind(updater);
			updater.checkForUpdates = () => {
				this.calls += 1;
				return original();
			};
		},
	};
	const installSpy = {
		calls: 0,
		wrap() {
			const original = updater.quitAndInstall.bind(updater);
			updater.quitAndInstall = (isSilent: boolean, runAfter?: boolean) => {
				this.calls += 1;
				return original(isSilent, runAfter);
			};
		},
	};
	checkSpy.wrap();
	installSpy.wrap();
	return { updater, checkSpy, installSpy };
}

function createSend() {
	const states: UpdateState[] = [];
	const send: UpdateSend = (state) => states.push(state);
	return { send, states };
}

describe('initUpdateService', () => {
	it('skips auto-check in development mode', () => {
		const { updater, checkSpy } = createMockUpdater();
		const { send, states } = createSend();

		initUpdateService(send, { autoUpdater: updater as never, isDev: true });

		expect(checkSpy.calls).toBe(0);
		expect(states).toHaveLength(0);
	});

	it('auto-checks on init in packaged mode', () => {
		const { updater, checkSpy } = createMockUpdater();
		const { send, states } = createSend();

		initUpdateService(send, { autoUpdater: updater as never, isDev: false });

		expect(checkSpy.calls).toBe(1);
		expect(states).toHaveLength(0); // checkForUpdates resolves to nothing by default.
	});

	it('checks again every 24 hours in packaged mode', async () => {
		jest.useFakeTimers({ legacyFakeTimers: true });
		const updater = new MockAppUpdater();
		let checkCount = 0;
		updater.checkForUpdates = () => {
			checkCount += 1;
			return Promise.resolve({} as unknown);
		};
		const { send } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false });
		expect(checkCount).toBe(1);

		// Let the init auto-check's promise chain settle before advancing the interval.
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		jest.advanceTimersByTime(24 * 60 * 60 * 1000);
		await Promise.resolve();
		expect(checkCount).toBe(2);

		jest.advanceTimersByTime(24 * 60 * 60 * 1000);
		await Promise.resolve();
		expect(checkCount).toBe(3);

		service.dispose();
		jest.useRealTimers();
	});
});

describe('UpdateService state transitions', () => {
	let updater: MockAppUpdater;
	let service: ReturnType<typeof initUpdateService>;
	let states: UpdateState[];

	beforeEach(() => {
		const mock = createMockUpdater();
		updater = mock.updater;
		const sendCapture = createSend();
		states = sendCapture.states;
		service = initUpdateService(sendCapture.send, { autoUpdater: updater as never, isDev: false });
	});

	afterEach(() => {
		service.dispose();
	});

	it('transitions idle → checking → available → downloading → downloaded', () => {
		updater.emit('checking-for-update');
		expect(states.at(-1)).toEqual({ phase: 'checking' });

		updater.emit('update-available', { version: '0.2.0' });
		expect(states.at(-1)).toEqual({ phase: 'available', version: '0.2.0' });

		updater.emit('download-progress', { percent: 42 });
		expect(states.at(-1)).toEqual({ phase: 'downloading', progress: 42 });

		updater.emit('update-downloaded', { version: '0.2.0' });
		expect(states.at(-1)).toEqual({ phase: 'downloaded', version: '0.2.0' });
	});

	it('returns to idle when no update is available', () => {
		updater.emit('checking-for-update');
		updater.emit('update-not-available');
		expect(states.at(-1)).toEqual({ phase: 'idle' });
	});

	it('manual check invokes checkForUpdates', async () => {
		const mock = createMockUpdater();
		const sendCapture = createSend();
		const localService = initUpdateService(sendCapture.send, {
			autoUpdater: mock.updater as never,
			isDev: false,
		});
		expect(mock.checkSpy.calls).toBe(1); // auto-check on init
		await new Promise((resolve) => setImmediate(resolve));
		localService.check();
		expect(mock.checkSpy.calls).toBe(2);
		localService.dispose();
	});

	it('install only quits when an update has been downloaded', () => {
		const mock = createMockUpdater();
		const sendCapture = createSend();
		const localService = initUpdateService(sendCapture.send, {
			autoUpdater: mock.updater as never,
			isDev: false,
		});
		localService.install();
		expect(mock.installSpy.calls).toBe(0);

		mock.updater.emit('update-downloaded', { version: '0.2.0' });
		localService.install();
		expect(mock.installSpy.calls).toBe(1);
		localService.dispose();
	});

	it('skips manual check while a check is already in flight', async () => {
		const updater = new MockAppUpdater();
		let resolveCheck: (() => void) | null = null;
		let checkCount = 0;
		updater.checkForUpdates = () => {
			checkCount += 1;
			return new Promise((resolve) => {
				resolveCheck = () => resolve({} as unknown);
			});
		};

		const sendCapture = createSend();
		const localService = initUpdateService(sendCapture.send, {
			autoUpdater: updater as never,
			isDev: false,
		});

		// The auto-check from init is in flight.
		expect(checkCount).toBe(1);
		localService.check();
		localService.check();
		expect(checkCount).toBe(1); // duplicate calls ignored while in flight

		expect(resolveCheck).not.toBeNull();
		resolveCheck!();
		await new Promise((resolve) => setImmediate(resolve));

		// After the in-flight check resolves, subsequent manual checks are allowed.
		localService.check();
		expect(checkCount).toBe(2);

		localService.dispose();
	});

	it('skips check and install when an update is already downloaded', () => {
		const mock = createMockUpdater();
		const sendCapture = createSend();
		const localService = initUpdateService(sendCapture.send, {
			autoUpdater: mock.updater as never,
			isDev: false,
		});

		mock.updater.emit('update-downloaded', { version: '0.2.0' });
		expect(sendCapture.states.at(-1)).toEqual({ phase: 'downloaded', version: '0.2.0' });

		// A new check should be ignored while an update is downloaded.
		localService.check();
		expect(mock.checkSpy.calls).toBe(1); // only the init auto-check

		// Install should be a one-shot action.
		localService.install();
		localService.install();
		expect(mock.installSpy.calls).toBe(1);

		localService.dispose();
	});
});

describe('UpdateService auto-check toggle (Plan 12 P3.7)', () => {
	it('does not perform the launch check when autoCheckEnabled is false', () => {
		const { updater, checkSpy } = createMockUpdater();
		const { send, states } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false, autoCheckEnabled: false });

		expect(checkSpy.calls).toBe(0);
		expect(states).toHaveLength(0);
		service.dispose();
	});

	it('does not start the periodic loop when autoCheckEnabled is false', async () => {
		jest.useFakeTimers({ legacyFakeTimers: true });
		const updater = new MockAppUpdater();
		let checkCount = 0;
		updater.checkForUpdates = () => {
			checkCount += 1;
			return Promise.resolve({} as unknown);
		};
		const { send } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false, autoCheckEnabled: false });
		expect(checkCount).toBe(0);

		jest.advanceTimersByTime(24 * 60 * 60 * 1000);
		await Promise.resolve();
		expect(checkCount).toBe(0);

		service.dispose();
		jest.useRealTimers();
	});

	it('setAutoCheckEnabled(true) starts the periodic loop at runtime', async () => {
		jest.useFakeTimers({ legacyFakeTimers: true });
		const updater = new MockAppUpdater();
		let checkCount = 0;
		updater.checkForUpdates = () => {
			checkCount += 1;
			return Promise.resolve({} as unknown);
		};
		const { send } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false, autoCheckEnabled: false });
		expect(checkCount).toBe(0);

		service.setAutoCheckEnabled(true);
		// Turning the toggle on starts the loop but does not itself trigger an
		// immediate check — only the 24h interval does.
		expect(checkCount).toBe(0);

		jest.advanceTimersByTime(24 * 60 * 60 * 1000);
		await Promise.resolve();
		expect(checkCount).toBe(1);

		service.dispose();
		jest.useRealTimers();
	});

	it('setAutoCheckEnabled(false) stops an in-progress periodic loop', async () => {
		jest.useFakeTimers({ legacyFakeTimers: true });
		const updater = new MockAppUpdater();
		let checkCount = 0;
		updater.checkForUpdates = () => {
			checkCount += 1;
			return Promise.resolve({} as unknown);
		};
		const { send } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false, autoCheckEnabled: true });
		expect(checkCount).toBe(1); // launch check

		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();

		service.setAutoCheckEnabled(false);

		jest.advanceTimersByTime(24 * 60 * 60 * 1000);
		await Promise.resolve();
		expect(checkCount).toBe(1); // no additional periodic check after disabling

		service.dispose();
		jest.useRealTimers();
	});

	it('manual check() still works while auto-check is disabled', async () => {
		const { updater, checkSpy } = createMockUpdater();
		const { send } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false, autoCheckEnabled: false });
		expect(checkSpy.calls).toBe(0);

		service.check();
		expect(checkSpy.calls).toBe(1);

		service.dispose();
	});

	it('is a no-op to disable twice in a row (does not throw or double-clear)', () => {
		const { updater } = createMockUpdater();
		const { send } = createSend();

		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false, autoCheckEnabled: false });
		service.setAutoCheckEnabled(false);
		service.setAutoCheckEnabled(false);

		service.dispose();
	});
});

describe('UpdateService error handling', () => {
	it('reports a user-friendly message for signature errors', () => {
		const { updater } = createMockUpdater();
		const { send, states } = createSend();
		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false });

		updater.emit('error', new Error('Code signature verification failed'));
		expect(states.at(-1)?.phase).toBe('error');
		expect(states.at(-1)?.error).toContain('not signed');

		service.dispose();
	});

	it('reports a user-friendly message for network errors', () => {
		const { updater } = createMockUpdater();
		const { send, states } = createSend();
		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false });

		updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
		expect(states.at(-1)?.phase).toBe('error');
		expect(states.at(-1)?.error).toBe('Update check failed: network error.');

		service.dispose();
	});

	it('does not leak raw error details for generic failures', () => {
		const { updater } = createMockUpdater();
		const { send, states } = createSend();
		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false });

		updater.emit('error', new Error('internal C:\\Users\\secret\\path leaked'));
		expect(states.at(-1)?.phase).toBe('error');
		expect(states.at(-1)?.error).toBe('Update check failed.');
		expect(states.at(-1)?.error).not.toContain('secret');

		service.dispose();
	});
});
