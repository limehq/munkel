import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { useNotchLifecycle, type UseNotchLifecycleReturn } from '../useNotchLifecycle';
import type { NotchMessage } from '../../../shared/types';

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

function createElectronApi() {
	return {
		notchSetInteractive: () => Promise.resolve(),
		notchEmpty: () => Promise.resolve(),
		onNotchShow: (cb: () => void) => {
			void cb;
			return () => {};
		},
		onNotchHide: (cb: () => void) => {
			void cb;
			return () => {};
		},
		onNotchReopen: (cb: () => void) => {
			void cb;
			return () => {};
		},
	};
}

function createClipboard() {
	return {
		writeText: (_text: string) => Promise.resolve(),
	};
}

function renderHook<T>(useHook: () => T) {
	const result = { current: null as T };
	function TestComponent() {
		result.current = useHook();
		return null;
	}
	const root = create(React.createElement(TestComponent));
	return { result, unmount: () => root.unmount() };
}

function renderHookStrict<T>(useHook: () => T) {
	const result = { current: null as T };
	function TestComponent() {
		result.current = useHook();
		return null;
	}
	const root = create(React.createElement(React.StrictMode, null, React.createElement(TestComponent)));
	return { result, unmount: () => root.unmount() };
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

describe('useNotchLifecycle', () => {
	let timers: FakeTimers;
	let electronApi: ReturnType<typeof createElectronApi>;
	let clipboard: ReturnType<typeof createClipboard>;

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();

		electronApi = createElectronApi();
		clipboard = createClipboard();

		(globalThis as any).window = { electronAPI: electronApi };
		(globalThis as any).navigator = { clipboard };
	});

	afterEach(() => {
		timers.restore();
		delete (globalThis as any).window;
		delete (globalThis as any).navigator;
	});

	it('happy path: message arrives → full → peek → retracted → prune → notchEmpty', async () => {
		const setInteractiveSpy = spyOn(electronApi, 'notchSetInteractive');
		const emptySpy = spyOn(electronApi, 'notchEmpty');

		const { result } = renderHook(useNotchLifecycle);

		expect(result.current.history.length).toBe(0);
		expect(result.current.phase).toBe('retracted');
		expect(result.current.ui).toBe('collapsed');

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});

		expect(result.current.history.length).toBe(1);
		expect(result.current.phase).toBe('full');
		expect(result.current.newest?.text).toBe('Hello');
		expect(result.current.ui).toBe('collapsed');
		expect(setInteractiveSpy).toHaveBeenCalledWith(true);

		await act(async () => {
			timers.advance(5_000);
		});
		expect(result.current.phase).toBe('peek');
		expect(result.current.ui).toBe('collapsed');
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(false);

		await act(async () => {
			timers.advance(30_000);
		});
		expect(result.current.phase).toBe('retracted');

		await act(async () => {
			timers.advance(25_000);
		});
		expect(result.current.history.length).toBe(0);
		expect(result.current.newest).toBeNull();
		expect(result.current.phase).toBe('retracted');
		expect(result.current.ui).toBe('collapsed');

		await act(async () => {
			timers.advance(350);
		});
		expect(emptySpy).toHaveBeenCalledTimes(1);
	});

	it('hover over collapsed notch enters preview, not open', async () => {
		const setInteractiveSpy = spyOn(electronApi, 'notchSetInteractive');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});

		await act(async () => {
			timers.advance(5_000);
		});
		expect(result.current.phase).toBe('peek');
		expect(result.current.ui).toBe('collapsed');
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(false);

		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('preview');
		expect(result.current.previewing).toBe(true);
		expect(result.current.reopening).toBe(false);
		expect(result.current.phase).toBe('peek');
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);
	});

	it('hover target does nothing while phase is full', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		expect(result.current.phase).toBe('full');
		expect(result.current.ui).toBe('collapsed');

		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('collapsed');
		expect(result.current.previewing).toBe(false);
	});

	it('clicking preview opens full view', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		await act(async () => {
			timers.advance(5_000);
		});
		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('preview');

		await act(async () => {
			result.current.openFromPreview();
		});
		expect(result.current.ui).toBe('open');
		expect(result.current.reopening).toBe(true);
	});

	it('mouse leave from preview returns to collapsed', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		await act(async () => {
			timers.advance(5_000);
		});
		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('preview');

		await act(async () => {
			result.current.scheduleHoverLeave();
			timers.advance(150);
		});
		expect(result.current.ui).toBe('collapsed');
	});

	it('mouse leave from open does nothing', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		await act(async () => {
			timers.advance(5_000);
		});
		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		await act(async () => {
			result.current.openFromPreview();
		});
		expect(result.current.ui).toBe('open');

		await act(async () => {
			result.current.scheduleHoverLeave();
			timers.advance(150);
		});
		expect(result.current.ui).toBe('open');
	});

	it('timer expiry still prunes while in preview', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		await act(async () => {
			timers.advance(5_000);
		});
		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('preview');

		await act(async () => {
			timers.advance(55_000);
		});
		expect(result.current.history.length).toBe(0);
		expect(result.current.newest).toBeNull();
		expect(result.current.ui).toBe('collapsed');
	});

	it('hover-stuck repro: preview does not block empty-hide', async () => {
		const emptySpy = spyOn(electronApi, 'notchEmpty');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		await act(async () => {
			timers.advance(5_000);
		});
		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('preview');

		// Simulate a missing mouseleave event — preview stays visible but the
		// history timer keeps running.
		await act(async () => {
			timers.advance(55_000);
		});
		expect(result.current.history.length).toBe(0);

		await act(async () => {
			timers.advance(350);
		});
		expect(emptySpy).toHaveBeenCalledTimes(1);
		expect(result.current.ui).toBe('collapsed');
	});

	it('external reopen opens full view', async () => {
		const { result } = renderHook(useNotchLifecycle);

		let reopenCallback: (() => void) | null = null;
		(globalThis as any).window = {
			electronAPI: {
				...electronApi,
				onNotchReopen: (cb: () => void) => {
					reopenCallback = cb;
					return () => {};
				},
			},
		};

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		expect(reopenCallback).not.toBeNull();
		expect(result.current.ui).toBe('collapsed');

		await act(async () => {
			reopenCallback!();
		});
		expect(result.current.ui).toBe('open');
	});

	it('external hide collapses UI and closes reply', async () => {
		const { result } = renderHook(useNotchLifecycle);

		let hideCallback: (() => void) | null = null;
		const onNotchHide = () => {};
		(globalThis as any).window = {
			electronAPI: {
				...electronApi,
				onNotchHide: (cb: () => void) => {
					hideCallback = cb;
					return () => {};
				},
			},
		};

		// Render a new instance with the onNotchHide option so the listener is wired.
		const { result: result2 } = renderHook(() => useNotchLifecycle({ onNotchHide }));

		await act(async () => {
			result2.current.onNotchMessage(makeMessage());
		});
		const entry = result2.current.history[0];
		await act(async () => {
			result2.current.openReply(entry);
		});
		expect(result2.current.replyOpen).toBe(true);

		await act(async () => {
			hideCallback!();
		});
		expect(result2.current.ui).toBe('collapsed');
		expect(result2.current.replyOpen).toBe(false);
	});

	it('keeps newest message first when multiple messages arrive', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'first' }));
		});

		await act(async () => {
			timers.advance(2_000);
		});

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'second' }));
		});

		expect(result.current.history.map((e) => e.text)).toEqual(['second', 'first']);
		expect(result.current.newest?.text).toBe('second');
		expect(result.current.phase).toBe('full');
		expect(result.current.ui).toBe('collapsed');
	});

	it('prune removes only entries older than 60 s', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'old' }));
		});

		await act(async () => {
			timers.advance(30_000);
		});

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'new' }));
		});

		await act(async () => {
			timers.advance(31_000);
		});

		expect(result.current.history.map((e) => e.text)).toEqual(['new']);
		expect(result.current.newest?.text).toBe('new');
	});

	it('keeps multiple messages within the 60 s window and prunes the oldest first', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'first' }));
		});
		await act(async () => {
			timers.advance(20_000);
		});
		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'second' }));
		});
		await act(async () => {
			timers.advance(20_000);
		});
		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'third' }));
		});

		expect(result.current.history.map((e) => e.text)).toEqual(['third', 'second', 'first']);

		await act(async () => {
			timers.advance(21_000);
		});
		expect(result.current.history.map((e) => e.text)).toEqual(['third', 'second']);

		await act(async () => {
			timers.advance(20_000);
		});
		expect(result.current.history.map((e) => e.text)).toEqual(['third']);
	});

	it('reply open keeps the notch interactive even in peek phase', async () => {
		const setInteractiveSpy = spyOn(electronApi, 'notchSetInteractive');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'reply me' }));
		});

		await act(async () => {
			timers.advance(5_000);
		});
		expect(result.current.phase).toBe('peek');
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(false);

		const entry = result.current.history[0];
		await act(async () => {
			result.current.openReply(entry);
		});
		expect(result.current.replyOpen).toBe(true);
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);
	});

	it('preview keeps the notch interactive in peek phase', async () => {
		const setInteractiveSpy = spyOn(electronApi, 'notchSetInteractive');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'peek' }));
		});

		await act(async () => {
			timers.advance(5_000);
		});
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(false);

		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('preview');
		expect(result.current.reopening).toBe(false);
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);
	});

	it('open keeps the notch interactive in peek phase', async () => {
		const setInteractiveSpy = spyOn(electronApi, 'notchSetInteractive');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'peek' }));
		});

		await act(async () => {
			timers.advance(5_000);
		});
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(false);

		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		await act(async () => {
			result.current.openFromPreview();
		});
		expect(result.current.ui).toBe('open');
		expect(result.current.reopening).toBe(true);
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);
	});

	it('copyText writes to clipboard and drives copiedId feedback', async () => {
		const writeSpy = spyOn(clipboard, 'writeText');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'copy this' }));
		});

		const entry = result.current.history[0];
		await act(async () => {
			result.current.copyText(entry);
		});

		expect(writeSpy).toHaveBeenCalledWith('copy this');
		expect(result.current.copiedId).toBe(entry.id);

		await act(async () => {
			timers.advance(1_500);
		});
		expect(result.current.copiedId).toBeNull();
	});

	it('clears timers on unmount', async () => {
		const clearTimeoutSpy = spyOn(globalThis, 'clearTimeout');
		const clearIntervalSpy = spyOn(globalThis, 'clearInterval');
		const { result, unmount } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		await act(async () => {
			result.current.scheduleHoverLeave();
		});

		const timeoutsBeforeUnmount = clearTimeoutSpy.mock.calls.length;
		const intervalsBeforeUnmount = clearIntervalSpy.mock.calls.length;

		await act(async () => {
			unmount();
		});

		expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(timeoutsBeforeUnmount);
		expect(clearIntervalSpy.mock.calls.length).toBeGreaterThan(intervalsBeforeUnmount);
	});

	it('cancels empty-hide timer when a new message arrives during the 350ms window', async () => {
		const emptySpy = spyOn(electronApi, 'notchEmpty');
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'first' }));
		});

		// Wait for the first message to be pruned, starting the empty-hide timer.
		await act(async () => {
			timers.advance(60_000);
		});
		expect(result.current.history.length).toBe(0);

		// Send a second message before the 350ms empty-hide timer fires.
		await act(async () => {
			timers.advance(200);
		});
		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'second' }));
		});

		// Advance past the original empty-hide deadline.
		await act(async () => {
			timers.advance(350);
		});

		expect(emptySpy).toHaveBeenCalledTimes(0);
		expect(result.current.history[0].text).toBe('second');
	});

	it('silent message skips full preview but still enters history', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ silent: true }));
		});

		expect(result.current.history.length).toBe(1);
		expect(result.current.phase).toBe('peek');
	});

	it('non-silent message still enters full preview', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ silent: false }));
		});

		expect(result.current.history.length).toBe(1);
		expect(result.current.phase).toBe('full');
	});

	it('handles StrictMode double-invoke without duplicating phase or prune timers', async () => {
		const emptySpy = spyOn(electronApi, 'notchEmpty');
		const { result, unmount } = renderHookStrict(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'strict' }));
		});
		expect(result.current.phase).toBe('full');

		await act(async () => {
			timers.advance(5_000);
		});
		expect(result.current.phase).toBe('peek');

		await act(async () => {
			timers.advance(55_000);
		});
		expect(result.current.history.length).toBe(0);

		await act(async () => {
			timers.advance(350);
		});
		expect(emptySpy).toHaveBeenCalledTimes(1);

		await act(async () => {
			unmount();
		});
	});

	describe('unread indicator dot (Plan 12 P3.3)', () => {
		it('is false while full/peek, and becomes true once the message retracts without interaction', async () => {
			const { result } = renderHook(useNotchLifecycle);

			await act(async () => {
				result.current.onNotchMessage(makeMessage());
			});
			expect(result.current.phase).toBe('full');
			expect(result.current.unread).toBe(false);

			await act(async () => {
				timers.advance(5_000);
			});
			expect(result.current.phase).toBe('peek');
			expect(result.current.unread).toBe(false);

			await act(async () => {
				timers.advance(30_000);
			});
			expect(result.current.phase).toBe('retracted');
			expect(result.current.unread).toBe(true);
		});

		it('never becomes true if the user hovered (reopened) before it retracted', async () => {
			const { result } = renderHook(useNotchLifecycle);

			await act(async () => {
				result.current.onNotchMessage(makeMessage());
			});

			await act(async () => {
				result.current.reopenFromHoverTarget();
			});
			expect(result.current.unread).toBe(false);

			await act(async () => {
				result.current.setHovering(false);
			});
			await act(async () => {
				timers.advance(35_000);
			});
			expect(result.current.phase).toBe('retracted');
			expect(result.current.unread).toBe(false);
		});

		it('never becomes true if the user opened a reply (click/reply interaction) before it retracted', async () => {
			const { result } = renderHook(useNotchLifecycle);

			await act(async () => {
				result.current.onNotchMessage(makeMessage());
			});

			await act(async () => {
				result.current.openReply(result.current.newest!);
			});
			await act(async () => {
				result.current.closeReply();
			});

			await act(async () => {
				timers.advance(35_000);
			});
			expect(result.current.phase).toBe('retracted');
			expect(result.current.unread).toBe(false);
		});

		it('clears once hovered (reopened) after already retracted unread', async () => {
			const { result } = renderHook(useNotchLifecycle);

			await act(async () => {
				result.current.onNotchMessage(makeMessage());
			});
			await act(async () => {
				timers.advance(35_000);
			});
			expect(result.current.unread).toBe(true);

			await act(async () => {
				result.current.reopenFromHoverTarget();
			});
			expect(result.current.unread).toBe(false);
		});

		it('resets to unread for each new message, independent of the previous message being read', async () => {
			const { result } = renderHook(useNotchLifecycle);

			await act(async () => {
				result.current.onNotchMessage(makeMessage({ text: 'first' }));
			});
			await act(async () => {
				result.current.reopenFromHoverTarget();
			});
			await act(async () => {
				result.current.setHovering(false);
			});
			await act(async () => {
				timers.advance(35_000);
			});
			expect(result.current.unread).toBe(false);

			await act(async () => {
				result.current.onNotchMessage(makeMessage({ text: 'second' }));
			});
			expect(result.current.unread).toBe(false); // full phase, not retracted yet

			await act(async () => {
				timers.advance(35_000);
			});
			expect(result.current.phase).toBe('retracted');
			expect(result.current.unread).toBe(true);
		});
	});
});
