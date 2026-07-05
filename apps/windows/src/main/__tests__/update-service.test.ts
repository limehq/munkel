import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
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

	it('manual check invokes checkForUpdates', () => {
		const mock = createMockUpdater();
		const sendCapture = createSend();
		const localService = initUpdateService(sendCapture.send, {
			autoUpdater: mock.updater as never,
			isDev: false,
		});
		expect(mock.checkSpy.calls).toBe(1); // auto-check on init
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

	it('reports the original message for generic errors', () => {
		const { updater } = createMockUpdater();
		const { send, states } = createSend();
		const service = initUpdateService(send, { autoUpdater: updater as never, isDev: false });

		updater.emit('error', new Error('Network request failed'));
		expect(states.at(-1)?.phase).toBe('error');
		expect(states.at(-1)?.error).toBe('Network request failed');

		service.dispose();
	});
});
