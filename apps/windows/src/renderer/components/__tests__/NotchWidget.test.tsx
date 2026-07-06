import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { AppProvider } from '../../store/app-store';
import NotchWidget from '../NotchWidget';
import type { NotchMessage, StateUpdate } from '../../../shared/types';

class FakeTimers {
	private now = 0;
	private nextId = 1000;
	private timers = new Map<
		number,
		{ fn: () => void; time: number; delay: number; repeat: boolean }
	>();
	private original = {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
		setInterval: globalThis.setInterval,
		clearInterval: globalThis.clearInterval,
		Date_now: Date.now,
	};

	install() {
		globalThis.setTimeout = ((fn: () => void, delay = 0) =>
			this.add(fn, delay, false)) as typeof globalThis.setTimeout;
		globalThis.clearTimeout = ((id: number | undefined) => this.remove(id)) as typeof globalThis.clearTimeout;
		globalThis.setInterval = ((fn: () => void, delay = 0) =>
			this.add(fn, delay, true)) as typeof globalThis.setInterval;
		globalThis.clearInterval = ((id: number | undefined) => this.remove(id)) as typeof globalThis.clearInterval;
		Date.now = () => this.now;
	}

	restore() {
		globalThis.setTimeout = this.original.setTimeout;
		globalThis.clearTimeout = this.original.clearTimeout;
		globalThis.setInterval = this.original.setInterval;
		globalThis.clearInterval = this.original.clearInterval;
		Date.now = this.original.Date_now;
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
		if (id !== undefined) {
			this.timers.delete(id);
		}
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

let messageCallback: ((data: NotchMessage) => void) | null = null;
let updateCallback: ((data: { isDirect: boolean }) => void) | null = null;
let showCallback: (() => void) | null = null;
let hideCallback: (() => void) | null = null;
let reopenCallback: (() => void) | null = null;

function createMockElectronApi() {
	messageCallback = null;
	updateCallback = null;
	showCallback = null;
	hideCallback = null;
	reopenCallback = null;

	return {
		getState: () =>
			Promise.resolve({
				identity: { memberId: 'test-member', displayName: 'Test User' },
				circles: [],
			} as StateUpdate),
		joinCircle: (_code: string, _relayUrl?: string) => Promise.resolve(),
		leaveCircle: (_code: string) => Promise.resolve(),
		sendChat: (_code: string, _text: string, _to?: string) => Promise.resolve({ ok: true }),
		sendImages: (_code: string, _paths: string[], _caption: string, _to?: string) =>
			Promise.resolve({ ok: true }),
		selectImages: () => Promise.resolve(undefined),
		updateProfile: (_displayName: string, _avatar?: string) => Promise.resolve(),
		setRelayUrl: (_code: string, _relayUrl: string) => Promise.resolve(),
		startGitHubLogin: () => Promise.resolve(),
		cancelGitHubLogin: () => Promise.resolve(),
		githubLogout: () => Promise.resolve(),
		checkForUpdates: () => Promise.resolve(),
		installUpdate: () => Promise.resolve(),
		beginNotchReply: () => Promise.resolve(),
		endNotchReply: () => Promise.resolve(),
		notchSetInteractive: (_interactive: boolean) => Promise.resolve(),
		notchEmpty: () => Promise.resolve(),
		onStateUpdate: (_cb: unknown) => () => {},
		onGitHubLoginState: (_cb: unknown) => () => {},
		onUpdateState: (_cb: unknown) => () => {},
		onNotchMessage: (cb: (data: NotchMessage) => void) => {
			messageCallback = cb;
			return () => {
				messageCallback = null;
			};
		},
		onNotchUpdate: (cb: (data: { isDirect: boolean }) => void) => {
			updateCallback = cb;
			return () => {
				updateCallback = null;
			};
		},
		onNotchShow: (cb: () => void) => {
			showCallback = cb;
			return () => {
				showCallback = null;
			};
		},
		onNotchHide: (cb: () => void) => {
			hideCallback = cb;
			return () => {
				hideCallback = null;
			};
		},
		onNotchReopen: (cb: () => void) => {
			reopenCallback = cb;
			return () => {
				reopenCallback = null;
			};
		},
		simulateNotchMessage: (data: NotchMessage) => messageCallback?.(data),
		simulateNotchReopen: () => reopenCallback?.(),
	};
}

function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
	return {
		sender: 'Alice',
		text: 'Hello',
		isDirect: false,
		group: 'test-circle',
		groupColor: '#3b82f6',
		receivedAt: new Date(Date.now()).toISOString(),
		...overrides,
	};
}

describe('NotchWidget', () => {
	let timers: FakeTimers;
	let electronApi: ReturnType<typeof createMockElectronApi>;

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();
		electronApi = createMockElectronApi();

		(globalThis as any).window = { electronAPI: electronApi };
		(globalThis as any).navigator = { clipboard: { writeText: () => Promise.resolve() } };
	});

	afterEach(() => {
		timers.restore();
		delete (globalThis as any).window;
		delete (globalThis as any).navigator;
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

	function findHistoryList(root: ReturnType<typeof create>) {
		return root.root.findAllByProps({ className: 'notch-history-list' });
	}

	function countHistoryEntries(root: ReturnType<typeof create>) {
		return root.root.findAllByProps({ className: 'history-entry' }).length;
	}

	function findReplyField(root: ReturnType<typeof create>) {
		return root.root.findAllByProps({ className: 'reply-field' });
	}

	it('renders the full history in the full phase', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first' }));
		});
		await act(async () => {
			timers.advance(1_000);
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second' }));
		});

		expect(findHistoryList(root).length).toBe(1);
		expect(countHistoryEntries(root)).toBe(2);
		const texts = root.root
			.findAllByProps({ className: 'message-text' })
			.map((node) => node.children.join(''));
		expect(texts).toEqual(['second', 'first']);
	});

	it('renders the history while ui is open', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first' }));
		});
		await act(async () => {
			timers.advance(5_000);
		});

		// In peek phase the list is hidden by default.
		expect(findHistoryList(root).length).toBe(0);

		await act(async () => {
			electronApi.simulateNotchReopen();
		});

		expect(findHistoryList(root).length).toBe(1);
		expect(countHistoryEntries(root)).toBe(1);
	});

	it('prunes old entries from the rendered list', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'old' }));
		});
		await act(async () => {
			timers.advance(1_000);
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'new' }));
		});

		expect(countHistoryEntries(root)).toBe(2);

		await act(async () => {
			timers.advance(59_500);
		});

		// The oldest entry is now older than 60 s and should be gone. Reopen the
		// notch so the remaining history list is rendered for inspection.
		await act(async () => {
			electronApi.simulateNotchReopen();
		});
		expect(countHistoryEntries(root)).toBe(1);
		const texts = root.root
			.findAllByProps({ className: 'message-text' })
			.map((node) => node.children.join(''));
		expect(texts).toEqual(['new']);
	});

	it('keeps an open reply on an older entry visible after the phase changes', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first' }));
		});
		await act(async () => {
			timers.advance(1_000);
		});
		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second' }));
		});

		// Open reply on the older (second) entry while still in the full phase.
		const replyButtons = root.root.findAllByProps({ 'aria-label': 'Reply' });
		expect(replyButtons.length).toBe(2);
		await act(async () => {
			replyButtons[1].props.onClick({ stopPropagation: () => {} });
		});
		expect(findReplyField(root).length).toBe(1);

		// Move into peek and then retracted phase; the reply must stay rendered.
		await act(async () => {
			timers.advance(5_000);
		});
		expect(findReplyField(root).length).toBe(1);

		await act(async () => {
			timers.advance(30_000);
		});
		expect(findReplyField(root).length).toBe(1);
	});

	it('closes the reply when a new message arrives', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'first' }));
		});

		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});
		expect(findReplyField(root).length).toBe(1);

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'second' }));
		});
		expect(findReplyField(root).length).toBe(0);
	});

	it('closes the reply when the replied-to entry is pruned', async () => {
		const root = await renderWidget();

		await act(async () => {
			electronApi.simulateNotchMessage(makeMessage({ text: 'reply me' }));
		});

		const replyButton = root.root.findByProps({ 'aria-label': 'Reply' });
		await act(async () => {
			replyButton.props.onClick({ stopPropagation: () => {} });
		});
		expect(findReplyField(root).length).toBe(1);

		await act(async () => {
			timers.advance(60_000);
		});
		expect(findReplyField(root).length).toBe(0);
	});
});
