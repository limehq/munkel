import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { AppProvider } from '../../store/app-store';
import NotchWidget from '../NotchWidget';
import type { NotchMessage } from '../../../shared/types';

// Minimal electronAPI surface NotchWidget (and the useNotchLifecycle hook it
// drives) touches. Kept separate from MenuWindow's mock so this file states
// its own dependency surface explicitly.
function createMockElectronApi() {
	let notchMessageCb: ((data: NotchMessage) => void) | null = null;
	let notchHideCbs: Array<() => void> = [];
	let copyHoveredCb: (() => void) | null = null;
	let copyHoveredRemoved = false;

	return {
		getState: () => Promise.resolve({ identity: null, circles: [] }),
		notchResize: (_contentHeight: number) => Promise.resolve(),
		notchSetInteractive: (_interactive: boolean) => Promise.resolve(),
		notchSetHoverCopyActive: (_active: boolean) => Promise.resolve(true),
		notchEmpty: () => Promise.resolve(),
		beginNotchReply: () => Promise.resolve(),
		endNotchReply: () => Promise.resolve(),
		sendChat: (_code: string, _text: string, _to?: string) => Promise.resolve({ ok: true }),
		onNotchMessage: (cb: (data: NotchMessage) => void) => {
			notchMessageCb = cb;
			return () => {
				notchMessageCb = null;
			};
		},
		onNotchUpdate: (_cb: unknown) => () => {},
		onNotchShow: (_cb: unknown) => () => {},
		onNotchHide: (cb: () => void) => {
			notchHideCbs.push(cb);
			return () => {
				notchHideCbs = notchHideCbs.filter((existing) => existing !== cb);
			};
		},
		onNotchReopen: (_cb: unknown) => () => {},
		onNotchCopyHovered: (cb: () => void) => {
			copyHoveredCb = cb;
			copyHoveredRemoved = false;
			return () => {
				copyHoveredCb = null;
				copyHoveredRemoved = true;
			};
		},
		onStateUpdate: (_cb: unknown) => () => {},
		onGitHubLoginState: (_cb: unknown) => () => {},
		onUpdateState: (_cb: unknown) => () => {},

		simulateNotchMessage: (message: NotchMessage) => notchMessageCb?.(message),
		simulateNotchHide: () => notchHideCbs.forEach((cb) => cb()),
		triggerCopyHovered: () => copyHoveredCb?.(),
		isCopyHoveredRemoved: () => copyHoveredRemoved,
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

	/** Real (not mocked) delay helper. Using real timers here — instead of a
	 * global fake-timer mock — avoids cross-file timer-mock leakage into
	 * other suites that share this test process (observed as flaky
	 * `window is not defined` failures when a global fake-timer mock was
	 * used previously). The debounce is short (80ms) so real waits stay fast. */
	function wait(ms: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	it('observes the widget element exactly once and re-reports height (debounced) when the observer fires', async () => {
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
		});
		// The report is debounced (~80ms), so it must not fire synchronously.
		expect(calls.length).toBe(callsBeforeFire);

		await act(async () => {
			await wait(150);
		});

		expect(calls.length).toBeGreaterThan(callsBeforeFire);

		await act(async () => {
			root.unmount();
		});
	});

	it('debounces rapid successive observer fires into a single notchResize call', async () => {
		const calls: number[] = [];
		electronApi.notchResize = (h: number) => {
			calls.push(h);
			return Promise.resolve();
		};

		const root = await renderWidget();
		const observer = FakeResizeObserver.instances[0];
		const callsAfterMount = calls.length;

		// Simulate an oscillating resize (e.g. from display-scaling rounding
		// mismatches) firing several times in quick succession — well within
		// the 80ms debounce window of each other.
		await act(async () => {
			observer.fire();
			await wait(20);
			observer.fire();
			await wait(20);
			observer.fire();
		});
		expect(calls.length).toBe(callsAfterMount);

		await act(async () => {
			await wait(150);
		});

		expect(calls.length).toBe(callsAfterMount + 1);

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

		const root = await renderWidget();
		expect(calls.length).toBe(0);

		// Unmount explicitly — an unmounted-but-still-mounted react-test-renderer
		// instance left dangling here previously leaked into later describe
		// blocks in this file (its effects/timers firing outside any `act()`
		// once a later test's `act()` flushed the microtask queue), producing a
		// spurious "not wrapped in act(...)" warning attributed to NotchWidget.
		await act(async () => {
			root.unmount();
		});
	});
});

describe('NotchWidget hover-"C" copy (Plan 12 P3.2)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
	let clipboardCalls: string[];
	let originalResizeObserver: unknown;

	function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
		return {
			sender: 'Alice',
			text: 'Hello from Alice',
			isDirect: false,
			group: 'test-circle',
			groupColor: '#3b82f6',
			receivedAt: new Date().toISOString(),
			...overrides,
		};
	}

	beforeEach(() => {
		electronApi = createMockElectronApi();
		clipboardCalls = [];
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		(globalThis as unknown as { navigator: unknown }).navigator = {
			clipboard: {
				writeText: (text: string) => {
					clipboardCalls.push(text);
					return Promise.resolve();
				},
			},
		};
		originalResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
		delete (globalThis as unknown as { navigator?: unknown }).navigator;
		(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = originalResizeObserver;
	});

	async function renderWidget() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<NotchWidget />
				</AppProvider>,
			);
			await Promise.resolve();
		});
		return root!;
	}

	function widgetNode(root: ReturnType<typeof create>) {
		return root.root.findByProps({ 'data-testid': 'notch-widget' });
	}

	it('copies the newest message when "C" fires while hovered and no row is hovered specifically', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'newest text' }));
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});

		await act(async () => {
			electronApi.triggerCopyHovered();
		});

		expect(clipboardCalls).toEqual(['newest text']);

		await act(async () => {
			root.unmount();
		});
	});

	it('does not copy when "C" fires without the notch being hovered', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'unhovered text' }));
		});

		// No onMouseEnter — the widget is never hovered.
		await act(async () => {
			electronApi.triggerCopyHovered();
		});

		expect(clipboardCalls).toEqual([]);

		await act(async () => {
			root.unmount();
		});
	});

	it('does not copy when the reply field is open, even while hovered', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'replying text' }));
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});

		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});

		await act(async () => {
			electronApi.triggerCopyHovered();
		});

		expect(clipboardCalls).toEqual([]);

		await act(async () => {
			root.unmount();
		});
	});

	it('disarms the hover-copy shortcut and removes the listener on unmount', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});

		let lastActive: boolean | undefined;
		electronApi.notchSetHoverCopyActive = (active: boolean) => {
			lastActive = active;
			return Promise.resolve(true);
		};

		await act(async () => {
			widgetNode(root).props.onMouseLeave();
		});
		expect(lastActive).toBe(false);

		expect(electronApi.isCopyHoveredRemoved()).toBe(false);

		await act(async () => {
			root.unmount();
		});

		expect(electronApi.isCopyHoveredRemoved()).toBe(true);
	});

	it('resets hover state when the main process hides the notch (no mouseleave will arrive)', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'hidden text' }));
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});

		const sent: boolean[] = [];
		electronApi.notchSetHoverCopyActive = (active: boolean) => {
			sent.push(active);
			return Promise.resolve(true);
		};

		await act(async () => {
			electronApi.simulateNotchHide();
		});

		// The hide reset hover state → the arm effect requested disarm.
		expect(sent).toContain(false);

		// And a stray "C" trigger after the hide copies nothing.
		await act(async () => {
			electronApi.triggerCopyHovered();
		});
		expect(clipboardCalls).toEqual([]);

		await act(async () => {
			root.unmount();
		});
	});

	it('latches the feature off when arming fails (register returns false) and stops sending IPC', async () => {
		const sent: boolean[] = [];
		electronApi.notchSetHoverCopyActive = (active: boolean) => {
			sent.push(active);
			// Simulate OS shortcut registration failure on every arm attempt.
			return Promise.resolve(!active);
		};

		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});
		const armAttempts = sent.filter((value) => value).length;
		expect(armAttempts).toBe(1); // one failed arm attempt

		// Further hover cycles must not retry — the feature is latched off.
		await act(async () => {
			widgetNode(root).props.onMouseLeave();
		});
		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});
		await act(async () => {
			widgetNode(root).props.onMouseMove?.();
		});

		expect(sent.filter((value) => value).length).toBe(armAttempts);

		await act(async () => {
			root.unmount();
		});
	});

	it('sends a throttled mousemove activity ping while hovered (keeps the main idle timer alive)', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});

		const sent: boolean[] = [];
		electronApi.notchSetHoverCopyActive = (active: boolean) => {
			sent.push(active);
			return Promise.resolve(true);
		};

		// First movement after mount always pings (lastPing starts at 0);
		// an immediate second movement is inside the 1s throttle window.
		await act(async () => {
			widgetNode(root).props.onMouseMove();
		});
		await act(async () => {
			widgetNode(root).props.onMouseMove();
		});

		expect(sent).toEqual([true]);

		await act(async () => {
			root.unmount();
		});
	});

	it('does not send activity pings while the reply field is open', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});

		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});

		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});

		const sent: boolean[] = [];
		electronApi.notchSetHoverCopyActive = (active: boolean) => {
			sent.push(active);
			return Promise.resolve(true);
		};

		await act(async () => {
			widgetNode(root).props.onMouseMove();
		});

		expect(sent).toEqual([]);

		await act(async () => {
			root.unmount();
		});
	});
});
