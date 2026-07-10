import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { AppProvider } from '../../store/app-store';
import NotchWidget from '../NotchWidget';

// Minimal electronAPI surface NotchWidget (and the useNotchLifecycle hook it
// drives) touches. Kept separate from MenuWindow's mock so this file states
// its own dependency surface explicitly.
function createMockElectronApi() {
	return {
		getState: () => Promise.resolve({ identity: null, circles: [] }),
		notchResize: (_contentHeight: number) => Promise.resolve(),
		notchSetInteractive: (_interactive: boolean) => Promise.resolve(),
		notchEmpty: () => Promise.resolve(),
		beginNotchReply: () => Promise.resolve(),
		endNotchReply: () => Promise.resolve(),
		sendChat: (_code: string, _text: string, _to?: string) => Promise.resolve({ ok: true }),
		onNotchMessage: (_cb: unknown) => () => {},
		onNotchUpdate: (_cb: unknown) => () => {},
		onNotchShow: (_cb: unknown) => () => {},
		onNotchHide: (_cb: unknown) => () => {},
		onNotchReopen: (_cb: unknown) => () => {},
		onStateUpdate: (_cb: unknown) => () => {},
		onGitHubLoginState: (_cb: unknown) => () => {},
		onUpdateState: (_cb: unknown) => () => {},
	};
}

/** Fake ResizeObserver: records observe/disconnect calls and lets a test
 * fire the resize callback on demand instead of depending on a real layout
 * engine (react-test-renderer has none). */
class FakeResizeObserver {
	static instances: FakeResizeObserver[] = [];
	observed: unknown[] = [];
	disconnected = false;
	private readonly callback: () => void;

	constructor(callback: () => void) {
		this.callback = callback;
		FakeResizeObserver.instances.push(this);
	}

	observe(target: unknown) {
		this.observed.push(target);
	}

	disconnect() {
		this.disconnected = true;
	}

	fire() {
		this.callback();
	}
}

describe('NotchWidget resize reporting (P1.3 / WIN-NOTCH-004)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
	let originalResizeObserver: unknown;

	beforeEach(() => {
		electronApi = createMockElectronApi();
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		originalResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		FakeResizeObserver.instances = [];
		(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
		(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
	});

	async function renderWidget() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<NotchWidget />
				</AppProvider>,
				{ createNodeMock: () => ({ offsetHeight: 123 }) },
			);
			await Promise.resolve();
		});
		return root!;
	}

	it('reports the initial widget offsetHeight via notchResize on mount', async () => {
		const calls: number[] = [];
		electronApi.notchResize = (h: number) => {
			calls.push(h);
			return Promise.resolve();
		};

		const root = await renderWidget();

		expect(calls).toContain(123);

		await act(async () => {
			root.unmount();
		});
	});

	it('observes the widget element exactly once and re-reports height when the observer fires', async () => {
		const calls: number[] = [];
		electronApi.notchResize = (h: number) => {
			calls.push(h);
			return Promise.resolve();
		};

		const root = await renderWidget();
		expect(FakeResizeObserver.instances.length).toBe(1);
		const observer = FakeResizeObserver.instances[0];
		expect(observer.observed.length).toBe(1);

		const callsBeforeFire = calls.length;
		await act(async () => {
			observer.fire();
			await Promise.resolve();
		});

		expect(calls.length).toBeGreaterThan(callsBeforeFire);

		await act(async () => {
			root.unmount();
		});
	});

	it('disconnects the ResizeObserver on unmount so it does not keep reporting after teardown', async () => {
		const root = await renderWidget();
		const observer = FakeResizeObserver.instances[0];
		expect(observer.disconnected).toBe(false);

		await act(async () => {
			root.unmount();
		});

		expect(observer.disconnected).toBe(true);
	});

	it('does not throw and skips resize reporting when ResizeObserver is unavailable (older/odd runtimes)', async () => {
		delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		const calls: number[] = [];
		electronApi.notchResize = (h: number) => {
			calls.push(h);
			return Promise.resolve();
		};

		await expect(renderWidget()).resolves.toBeDefined();
		expect(calls.length).toBe(0);
	});
});
