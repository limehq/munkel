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

function makeMessage(overrides: Partial<NotchMessage> = {}): NotchMessage {
	return {
		sender: 'Alice',
		text: 'Hello',
		isDirect: false,
		group: 'demo',
		groupColor: '#ff0000',
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

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});

		expect(result.current.history.length).toBe(1);
		expect(result.current.phase).toBe('full');
		expect(result.current.newest?.text).toBe('Hello');
		expect(setInteractiveSpy).toHaveBeenCalledWith(true);

		await act(async () => {
			timers.advance(5_000);
		});
		expect(result.current.phase).toBe('peek');
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

		await act(async () => {
			timers.advance(350);
		});
		expect(emptySpy).toHaveBeenCalledTimes(1);
	});

	it('hover-stuck repro: hovering never clears but empty-hide still fires', async () => {
		const setInteractiveSpy = spyOn(electronApi, 'notchSetInteractive');
		const emptySpy = spyOn(electronApi, 'notchEmpty');

		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		expect(result.current.hovering).toBe(false);

		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.hovering).toBe(true);
		expect(result.current.reopening).toBe(true);
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);

		await act(async () => {
			timers.advance(5_000);
		});
		expect(result.current.phase).toBe('peek');
		// hovering is still true, so the window remains interactive via reopening.
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);

		// Simulate a missing mouseleave event — hovering stays true.
		expect(result.current.hovering).toBe(true);

		await act(async () => {
			timers.advance(55_000);
		});
		expect(result.current.history.length).toBe(0);

		await act(async () => {
			timers.advance(350);
		});
		expect(emptySpy).toHaveBeenCalledTimes(1);
		// hovering is still stuck to demonstrate the bug condition, but the hide
		// deadline no longer depends on it.
		expect(result.current.hovering).toBe(true);
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

	it('reopening keeps the notch interactive in peek phase', async () => {
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
			result.current.setHovering(true);
		});
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
});
