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

describe('NotchWidget avatar pulse wiring (Plan 12 P3 follow-up)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
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
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		originalResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
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
			);
			await Promise.resolve();
		});
		return root!;
	}

	function widgetNode(root: ReturnType<typeof create>) {
		return root.root.findByProps({ 'data-testid': 'notch-widget' });
	}

	function avatarClassNames(root: ReturnType<typeof create>) {
		return root.root
			.findAllByProps({})
			.filter((node) => typeof node.props.className === 'string' && node.props.className.startsWith('avatar'))
			.map((node) => node.props.className);
	}

	it('pulses the avatar on the full-view render of a freshly arrived message', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});

		expect(avatarClassNames(root)).toContain('avatar avatar-pulse');

		await act(async () => {
			root.unmount();
		});
	});

	it('does not pulse history rows when the notch is reopened via hover', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first' }));
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second (now newest)' }));
		});

		// Reopen via the hover target so the history-list branch renders,
		// which never passes `pulse` to any row — including the (no longer
		// freshly-mounting) former-newest message.
		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});
		const hoverTarget = root.root.findByProps({ className: 'notch-hover-target' });
		await act(async () => {
			hoverTarget.props.onMouseEnter();
		});

		expect(avatarClassNames(root)).not.toContain('avatar avatar-pulse');
		expect(avatarClassNames(root).length).toBeGreaterThan(0);

		await act(async () => {
			root.unmount();
		});
	});
});

describe('NotchWidget history expand/collapse (Plan 12 P3.6)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
	let originalResizeObserver: unknown;

	function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
		return {
			sender: 'Alice',
			text: 'A rather long message that should overflow a single collapsed line of text easily',
			isDirect: false,
			group: 'test-circle',
			groupColor: '#3b82f6',
			receivedAt: new Date().toISOString(),
			...overrides,
		};
	}

	beforeEach(() => {
		electronApi = createMockElectronApi();
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		(globalThis as unknown as { navigator: unknown }).navigator = {
			clipboard: {
				writeText: (_text: string) => Promise.resolve(),
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

	async function reopenHistory(root: ReturnType<typeof create>) {
		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});
		const hoverTarget = root.root.findByProps({ className: 'notch-hover-target' });
		await act(async () => {
			hoverTarget.props.onMouseEnter();
		});
	}

	// Entries get a real crypto.randomUUID() id, so tests locate a row by its
	// message text (unique per test message) rather than a literal id.
	function entryByText(root: ReturnType<typeof create>, text: string) {
		const candidates = root.root.findAll(
			(node) =>
				typeof node.props['data-testid'] === 'string' &&
				(node.props['data-testid'] as string).startsWith('history-entry-'),
		);
		const match = candidates.find((entry) =>
			entry.findAllByType('p').some((p) => p.props.children === text),
		);
		if (!match) throw new Error(`no history entry found for text: ${text}`);
		return match;
	}

	function chevronOf(entry: ReturnType<typeof entryByText>) {
		return entry.findByProps({ className: 'icon-button history-expand-button' });
	}

	function messageTextOf(entry: ReturnType<typeof entryByText>) {
		return entry.findByType('p');
	}

	it('renders reopened history rows collapsed (ellipsis) by default', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first message' }));
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second message' }));
		});

		await reopenHistory(root);

		expect(messageTextOf(entryByText(root, 'first message')).props.className).toBe(
			'message-text message-text-collapsed',
		);
		expect(messageTextOf(entryByText(root, 'second message')).props.className).toBe(
			'message-text message-text-collapsed',
		);

		await act(async () => {
			root.unmount();
		});
	});

	it('expands a row on chevron click and collapses again on a second click, without affecting other rows', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first message' }));
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second message' }));
		});
		await reopenHistory(root);

		const entry = entryByText(root, 'second message');
		const chevron = chevronOf(entry);
		expect(chevron.props['aria-expanded']).toBe(false);

		await act(async () => {
			chevron.props.onClick({ stopPropagation: () => {} });
		});
		expect(messageTextOf(entryByText(root, 'second message')).props.className).toBe('message-text');
		expect(chevronOf(entryByText(root, 'second message')).props['aria-expanded']).toBe(true);

		// The other row must stay collapsed.
		expect(messageTextOf(entryByText(root, 'first message')).props.className).toBe(
			'message-text message-text-collapsed',
		);

		await act(async () => {
			chevronOf(entryByText(root, 'second message')).props.onClick({ stopPropagation: () => {} });
		});
		expect(messageTextOf(entryByText(root, 'second message')).props.className).toBe(
			'message-text message-text-collapsed',
		);

		await act(async () => {
			root.unmount();
		});
	});

	it('clicking the chevron does not open the reply field (click-to-reply on the row is unaffected)', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'reply-target message' }));
		});
		await reopenHistory(root);

		const entry = entryByText(root, 'reply-target message');
		const chevron = chevronOf(entry);

		let propagated = true;
		await act(async () => {
			chevron.props.onClick({
				stopPropagation: () => {
					propagated = false;
				},
			});
		});
		expect(propagated).toBe(false);
		expect(entryByText(root, 'reply-target message').findAllByProps({ className: 'reply-field' }).length).toBe(0);

		await act(async () => {
			root.unmount();
		});
	});

	it('clicking the message body still opens the reply field (existing click-to-reply is preserved)', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'reply-target message' }));
		});
		await reopenHistory(root);

		const entry = entryByText(root, 'reply-target message');
		const body = entry.findByProps({ className: 'message-body' });

		(globalThis as unknown as { window: { getSelection: () => unknown } }).window.getSelection = () => null;

		await act(async () => {
			body.props.onClick({ clientX: 0, clientY: 0, currentTarget: { contains: () => false } });
		});

		expect(
			entryByText(root, 'reply-target message').findAllByProps({ className: 'reply-field' }).length,
		).toBe(1);

		await act(async () => {
			root.unmount();
		});
	});

	it("per-row copy button copies that row's text", async () => {
		const root = await renderWidget();
		const calls: string[] = [];
		(globalThis as unknown as { navigator: { clipboard: { writeText: (t: string) => Promise<void> } } }).navigator = {
			clipboard: {
				writeText: (text: string) => {
					calls.push(text);
					return Promise.resolve();
				},
			},
		};
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first message' }));
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second message' }));
		});
		await reopenHistory(root);

		const entry = entryByText(root, 'first message');
		const copyButton = entry.findByProps({ className: 'icon-button copy-button' });

		await act(async () => {
			copyButton.props.onClick({ stopPropagation: () => {} });
		});

		expect(calls).toEqual(['first message']);

		await act(async () => {
			root.unmount();
		});
	});

	it('resets expanded rows to collapsed the next time the notch is reopened after a hide', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first message' }));
		});
		await reopenHistory(root);

		const chevron = chevronOf(entryByText(root, 'first message'));
		await act(async () => {
			chevron.props.onClick({ stopPropagation: () => {} });
		});
		expect(messageTextOf(entryByText(root, 'first message')).props.className).toBe('message-text');

		await act(async () => {
			electronApi.simulateNotchHide();
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'new message after reopen' }));
		});
		await reopenHistory(root);

		expect(messageTextOf(entryByText(root, 'new message after reopen')).props.className).toBe(
			'message-text message-text-collapsed',
		);

		await act(async () => {
			root.unmount();
		});
	});
});

describe('NotchWidget history expand resize reporting (Iteration-8 review follow-up)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
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

	function wait(ms: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	function widgetNode(root: ReturnType<typeof create>) {
		return root.root.findByProps({ 'data-testid': 'notch-widget' });
	}

	async function reopenHistory(root: ReturnType<typeof create>) {
		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});
		const hoverTarget = root.root.findByProps({ className: 'notch-hover-target' });
		await act(async () => {
			hoverTarget.props.onMouseEnter();
		});
	}

	function entryByText(root: ReturnType<typeof create>, text: string) {
		const candidates = root.root.findAll(
			(node) =>
				typeof node.props['data-testid'] === 'string' &&
				(node.props['data-testid'] as string).startsWith('history-entry-'),
		);
		const match = candidates.find((entry) => entry.findAllByType('p').some((p) => p.props.children === text));
		if (!match) throw new Error(`no history entry found for text: ${text}`);
		return match;
	}

	function chevronOf(entry: ReturnType<typeof entryByText>) {
		return entry.findByProps({ className: 'icon-button history-expand-button' });
	}

	it('reports a larger height via notchResize when a history row is expanded, coherent with the CSS resize-on-expand path', async () => {
		const nodeMock = { offsetHeight: 150 };
		const calls: number[] = [];
		electronApi.notchResize = (h: number) => {
			calls.push(h);
			return Promise.resolve();
		};

		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<NotchWidget />
				</AppProvider>,
				{ createNodeMock: () => nodeMock },
			);
			await Promise.resolve();
		});

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'expand-resize message' }));
		});
		await reopenHistory(root!);
		await act(async () => {
			await wait(150);
		});
		const callsBeforeExpand = calls.length;

		// A real browser's ResizeObserver fires automatically once expanding
		// the row grows `.notch-widget`'s layout height; react-test-renderer
		// has no layout engine, so this test mutates the mocked offsetHeight
		// and re-fires the observer itself to exercise the same debounced
		// report → notchResize plumbing the real observer would trigger.
		const chevron = chevronOf(entryByText(root!, 'expand-resize message'));
		await act(async () => {
			chevron.props.onClick({ stopPropagation: () => {} });
		});
		nodeMock.offsetHeight = 340;
		const observer = FakeResizeObserver.instances.at(-1)!;
		await act(async () => {
			observer.fire();
			await wait(150);
		});

		expect(calls.length).toBeGreaterThan(callsBeforeExpand);
		expect(calls.at(-1)).toBe(340);
		expect(calls.at(-1)!).toBeGreaterThan(150);
		// Clamp-boundary behavior for heights at/above NOTCH_MAX_HEIGHT (480)
		// is main-process responsibility, already covered by
		// notch-window.test.ts's clampNotchHeight tests (`clampNotchHeight`
		// clamping 10_000 → NOTCH_MAX_HEIGHT, and exact-boundary handling) —
		// the renderer here only ever reports the raw rendered height, which
		// is what `.notch-content`'s new max-height/overflow-y CSS rule
		// (global.css) relies on to scroll internally once the window has
		// grown to that clamp.

		await act(async () => {
			root!.unmount();
		});
	});
});

/**
 * Deterministic fake timer/interval implementation, mirroring the one
 * already proven safe in useNotchLifecycle.test.ts (same package). Scoped
 * with install()/restore() to a single describe block's beforeEach/afterEach
 * below so it can never leak into other describes in this file — the other
 * describes above deliberately use real timers (see the "resize reporting"
 * describe's comment on prior fake-timer flakiness), which this local class
 * does not touch since it's only installed for the tests that opt in.
 */
class FakeTimers {
	private now = 0;
	private nextId = 1;
	private readonly timers = new Map<
		number,
		{ fn: () => void; time: number; delay: number; repeat: boolean }
	>();
	private readonly original = {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
		setInterval: globalThis.setInterval,
		clearInterval: globalThis.clearInterval,
		dateNow: Date.now,
	};

	install() {
		globalThis.setTimeout = ((fn: () => void, delay = 0) => this.add(fn, delay, false)) as typeof setTimeout;
		globalThis.clearTimeout = ((id: number | undefined) => this.remove(id)) as typeof clearTimeout;
		globalThis.setInterval = ((fn: () => void, delay = 0) => this.add(fn, delay, true)) as typeof setInterval;
		globalThis.clearInterval = ((id: number | undefined) => this.remove(id)) as typeof clearInterval;
		Date.now = () => this.now;
	}

	restore() {
		globalThis.setTimeout = this.original.setTimeout;
		globalThis.clearTimeout = this.original.clearTimeout;
		globalThis.setInterval = this.original.setInterval;
		globalThis.clearInterval = this.original.clearInterval;
		Date.now = this.original.dateNow;
	}

	advance(ms: number) {
		this.now += ms;
		this.runDue();
	}

	private add(fn: () => void, delay: number, repeat: boolean): number {
		const id = this.nextId++;
		this.timers.set(id, { fn, time: this.now + delay, delay, repeat });
		return id;
	}

	private remove(id: number | undefined) {
		if (id !== undefined) this.timers.delete(id);
	}

	private runDue() {
		const due = [...this.timers.entries()]
			.filter(([, timer]) => timer.time <= this.now)
			.sort((a, b) => a[1].time - b[1].time);
		for (const [id, timer] of due) {
			if (!this.timers.has(id)) continue;
			if (timer.repeat) {
				timer.time += timer.delay;
			} else {
				this.timers.delete(id);
			}
			timer.fn();
		}
	}
}

describe('NotchWidget history pruning & pulse-across-phase (Iteration-8 review follow-up)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
	let originalResizeObserver: unknown;
	let timers: FakeTimers;

	function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
		return {
			sender: 'Alice',
			text: 'Hello from Alice',
			isDirect: false,
			group: 'test-circle',
			groupColor: '#3b82f6',
			receivedAt: new Date(Date.now()).toISOString(),
			...overrides,
		};
	}

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();
		electronApi = createMockElectronApi();
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		(globalThis as unknown as { navigator: unknown }).navigator = {
			clipboard: { writeText: (_text: string) => Promise.resolve() },
		};
		originalResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
	});

	afterEach(() => {
		timers.restore();
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

	async function reopenHistory(root: ReturnType<typeof create>) {
		await act(async () => {
			widgetNode(root).props.onMouseEnter();
		});
		const hoverTarget = root.root.findByProps({ className: 'notch-hover-target' });
		await act(async () => {
			hoverTarget.props.onMouseEnter();
		});
	}

	function entryByText(root: ReturnType<typeof create>, text: string) {
		const candidates = root.root.findAll(
			(node) =>
				typeof node.props['data-testid'] === 'string' &&
				(node.props['data-testid'] as string).startsWith('history-entry-'),
		);
		const match = candidates.find((entry) => entry.findAllByType('p').some((p) => p.props.children === text));
		if (!match) throw new Error(`no history entry found for text: ${text}`);
		return match;
	}

	function chevronOf(entry: ReturnType<typeof entryByText>) {
		return entry.findByProps({ className: 'icon-button history-expand-button' });
	}

	function messageTextOf(entry: ReturnType<typeof entryByText>) {
		return entry.findByType('p');
	}

	function avatarClassNames(root: ReturnType<typeof create>) {
		return root.root
			.findAllByProps({})
			.filter((node) => typeof node.props.className === 'string' && node.props.className.startsWith('avatar'))
			.map((node) => node.props.className);
	}

	it('prunes expanded-row ids for entries that age out of the 60s history window while the notch stays visible (not just on hide)', async () => {
		const root = await renderWidget();

		// 'expire message' is created already close to the 60s history
		// boundary so the next 1s prune tick (useNotchLifecycle's
		// PRUNE_INTERVAL_MS) drops it while the notch remains reopened —
		// this test never calls simulateNotchHide(), unlike the existing
		// "resets ... after a hide" test above.
		await act(async () => {
			electronApi.simulateNotchMessage(
				makeMessage({ text: 'expire message', receivedAt: new Date(Date.now() - 59_700).toISOString() }),
			);
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'keep message' }));
		});

		await reopenHistory(root);

		await act(async () => {
			chevronOf(entryByText(root, 'expire message')).props.onClick({ stopPropagation: () => {} });
		});
		await act(async () => {
			chevronOf(entryByText(root, 'keep message')).props.onClick({ stopPropagation: () => {} });
		});
		expect(messageTextOf(entryByText(root, 'expire message')).props.className).toBe('message-text');
		expect(messageTextOf(entryByText(root, 'keep message')).props.className).toBe('message-text');

		// Advance past the prune interval so 'expire message' (already ~59.7s
		// old) crosses the 60s window and is dropped from `history` while
		// still hovered/reopened.
		await act(async () => {
			timers.advance(1_000);
		});

		expect(() => entryByText(root, 'expire message')).toThrow();
		// The still-valid row must keep its expanded state — proving the
		// prune effect selectively removes only the expired id from the Set,
		// rather than resetting it wholesale (that blanket-reset path is
		// covered separately by the existing on-hide test).
		expect(messageTextOf(entryByText(root, 'keep message')).props.className).toBe('message-text');

		await act(async () => {
			root.unmount();
		});
	});

	it('does not re-pulse the avatar on a FULL→PEEK phase transition of the same visible message', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});
		expect(avatarClassNames(root)).toContain('avatar avatar-pulse');

		// Keep a reply open on the newest message so the full-view render
		// branch (and its mounted Avatar) survives the phase decaying past
		// 'full' instead of unmounting — see renderMessageRow's branch
		// condition (`phase === 'full' || replyingTo === newest.id`).
		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});

		// Let the one-time pulse duration (900ms) elapse naturally first.
		await act(async () => {
			timers.advance(950);
		});
		expect(avatarClassNames(root)).not.toContain('avatar avatar-pulse');

		// Cross the FULL→PEEK boundary (NOTCH_FULL_MS = 5000ms) with the same
		// message still mounted. If the phase transition had remounted the
		// Avatar instead of reusing the same instance, its mount-only pulse
		// state would restart and 'avatar-pulse' would reappear here.
		await act(async () => {
			timers.advance(4_100);
		});
		expect(avatarClassNames(root)).not.toContain('avatar avatar-pulse');

		await act(async () => {
			root.unmount();
		});
	});
});

describe('NotchWidget reply character limit (2048, Plan 12)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
	let originalResizeObserver: unknown;
	let timers: FakeTimers;

	function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
		return {
			sender: 'Alice',
			senderMemberId: 'alice-id',
			text: 'Hello from Alice',
			isDirect: false,
			group: 'test-circle',
			groupColor: '#3b82f6',
			receivedAt: new Date(Date.now()).toISOString(),
			...overrides,
		};
	}

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();
		electronApi = createMockElectronApi();
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		(globalThis as unknown as { navigator: unknown }).navigator = {
			clipboard: { writeText: (_text: string) => Promise.resolve() },
		};
		originalResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
	});

	afterEach(() => {
		timers.restore();
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

	async function openReplyForNewest(root: ReturnType<typeof create>) {
		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});
	}

	function replyInput(root: ReturnType<typeof create>) {
		return root.root.findByProps({ className: 'frosted-field' });
	}

	it('sets maxLength=2048 on the reply input', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});
		await openReplyForNewest(root);

		expect(replyInput(root).props.maxLength).toBe(2048);

		await act(async () => {
			root.unmount();
		});
	});

	it('clamps typed/pasted reply text over 2048 characters to exactly 2048', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});
		await openReplyForNewest(root);

		const overLong = 'x'.repeat(3000);
		await act(async () => {
			replyInput(root).props.onChange({ target: { value: overLong } });
		});

		expect(replyInput(root).props.value.length).toBe(2048);
		expect(replyInput(root).props.value).toBe('x'.repeat(2048));

		await act(async () => {
			root.unmount();
		});
	});

	it('allows a reply of exactly 2048 characters unmodified', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage());
		});
		await openReplyForNewest(root);

		const exact = 'y'.repeat(2048);
		await act(async () => {
			replyInput(root).props.onChange({ target: { value: exact } });
		});

		expect(replyInput(root).props.value).toBe(exact);

		await act(async () => {
			root.unmount();
		});
	});
});

describe('NotchWidget "Sent to …" reply confirmation (Plan 12)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;
	let originalResizeObserver: unknown;
	let timers: FakeTimers;

	function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
		return {
			sender: 'Alice',
			senderMemberId: 'alice-id',
			text: 'Hello from Alice',
			isDirect: false,
			group: 'test-circle',
			groupColor: '#3b82f6',
			receivedAt: new Date(Date.now()).toISOString(),
			...overrides,
		};
	}

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();
		electronApi = createMockElectronApi();
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = {
			electronAPI: electronApi,
		};
		(globalThis as unknown as { navigator: unknown }).navigator = {
			clipboard: { writeText: (_text: string) => Promise.resolve() },
		};
		originalResizeObserver = (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
		delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver;
	});

	afterEach(() => {
		timers.restore();
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

	async function openReplyForNewest(root: ReturnType<typeof create>) {
		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});
	}

	function replyInput(root: ReturnType<typeof create>) {
		return root.root.findByProps({ className: 'frosted-field' });
	}

	function sendButton(root: ReturnType<typeof create>) {
		return root.root.findByProps({ title: 'Send' });
	}

	function findSentConfirmation(root: ReturnType<typeof create>) {
		const matches = root.root.findAll(
			(node) =>
				typeof node.props['data-testid'] === 'string' &&
				(node.props['data-testid'] as string).startsWith('sent-confirmation-'),
		);
		return matches[0];
	}

	it('shows a "Sent to all" confirmation chip after a successful broadcast reply, replacing the reply field', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false }));
		});
		await openReplyForNewest(root);

		await act(async () => {
			replyInput(root).props.onChange({ target: { value: 'hi everyone' } });
		});
		await act(async () => {
			sendButton(root).props.onClick();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		const chip = findSentConfirmation(root);
		expect(chip).toBeDefined();
		expect(chip!.props.children).toEqual([expect.anything(), 'Sent to all']);
		expect(chip!.props.role).toBe('status');
		expect(chip!.props['aria-live']).toBe('polite');
		// The reply field itself is gone while the chip is shown.
		expect(root.root.findAllByProps({ title: 'Send' }).length).toBe(0);

		await act(async () => {
			root.unmount();
		});
	});

	it('shows a "Sent to <sender>" confirmation chip after a successful private reply', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: true, sender: 'Alice' }));
		});
		await openReplyForNewest(root);

		await act(async () => {
			replyInput(root).props.onChange({ target: { value: 'just for you' } });
		});
		await act(async () => {
			sendButton(root).props.onClick();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		const chip = findSentConfirmation(root);
		expect(chip).toBeDefined();
		expect(chip!.props.children).toEqual([expect.anything(), 'Sent to Alice']);

		await act(async () => {
			root.unmount();
		});
	});

	it('auto-dismisses the confirmation chip and closes the reply field after the dwell time', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false }));
		});
		await openReplyForNewest(root);

		await act(async () => {
			replyInput(root).props.onChange({ target: { value: 'hi everyone' } });
		});
		await act(async () => {
			sendButton(root).props.onClick();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(findSentConfirmation(root)).toBeDefined();

		await act(async () => {
			timers.advance(1_600);
		});

		expect(findSentConfirmation(root)).toBeUndefined();
		// The reply field did not reappear either — the reply is fully closed.
		expect(root.root.findAllByProps({ title: 'Send' }).length).toBe(0);

		await act(async () => {
			root.unmount();
		});
	});

	it('does not show a confirmation chip when the send fails, and keeps the reply field open with the error', async () => {
		const root = await renderWidget();
		electronApi.sendChat = (_code: string, _text: string, _to?: string) =>
			Promise.resolve({ ok: false, error: 'Circle offline — reply not sent.' });
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false }));
		});
		await openReplyForNewest(root);

		await act(async () => {
			replyInput(root).props.onChange({ target: { value: 'hi everyone' } });
		});
		await act(async () => {
			sendButton(root).props.onClick();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(findSentConfirmation(root)).toBeUndefined();
		// The reply field is still there (not replaced by a chip).
		expect(root.root.findAllByProps({ title: 'Send' }).length).toBe(1);
		expect(root.root.findByProps({ className: 'reply-error' })).toBeDefined();

		await act(async () => {
			root.unmount();
		});
	});

	it('clears a pending confirmation chip when a new message arrives', async () => {
		const root = await renderWidget();
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false, text: 'first' }));
		});
		await openReplyForNewest(root);
		await act(async () => {
			replyInput(root).props.onChange({ target: { value: 'hi everyone' } });
		});
		await act(async () => {
			sendButton(root).props.onClick();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(findSentConfirmation(root)).toBeDefined();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false, text: 'second' }));
		});

		expect(findSentConfirmation(root)).toBeUndefined();

		await act(async () => {
			root.unmount();
		});
	});

	it('does not let a stale confirmation timer close a reply the user opened on a different entry', async () => {
		const root = await renderWidget();
		const widgetNode = () => root.root.findByProps({ 'data-testid': 'notch-widget' });
		const entryByText = (text: string) => {
			const candidates = root.root.findAll(
				(node) =>
					typeof node.props['data-testid'] === 'string' &&
					(node.props['data-testid'] as string).startsWith('history-entry-'),
			);
			const match = candidates.find((entry) =>
				entry.findAllByType('p').some((p) => p.props.children === text),
			);
			if (!match) throw new Error(`no history entry found for text: ${text}`);
			return match;
		};

		// A arrives, then B (A → history, B newest). No new-message clear is in
		// play by the time we reopen history (that path is covered separately).
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false, text: 'message A' }));
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ isDirect: false, text: 'message B' }));
		});

		// Reply to B (the newest / full view) and send → chip + 1.5s timer.
		await openReplyForNewest(root);
		await act(async () => {
			replyInput(root).props.onChange({ target: { value: 'to B' } });
		});
		await act(async () => {
			sendButton(root).props.onClick();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(findSentConfirmation(root)).toBeDefined();

		// Before the timer fires, reopen history and open a reply on A instead.
		await act(async () => {
			widgetNode().props.onMouseEnter();
		});
		await act(async () => {
			root.root.findByProps({ className: 'notch-hover-target' }).props.onMouseEnter();
		});
		await act(async () => {
			entryByText('message A').findByProps({ 'aria-label': 'Reply' }).props.onClick({ stopPropagation: () => {} });
		});

		// Opening A's reply cancelled B's stale confirmation timer.
		expect(findSentConfirmation(root)).toBeUndefined();

		// Advancing past B's original 1.5s dwell must NOT close A's reply.
		await act(async () => {
			timers.advance(2_000);
		});

		// A's reply field is still open (its Send button is present).
		expect(root.root.findAllByProps({ title: 'Send' }).length).toBe(1);

		await act(async () => {
			root.unmount();
		});
	});
});
