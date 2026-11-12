import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { useNotchLifecycle, type UseNotchLifecycleReturn } from '../useNotchLifecycle';
import type { NotchMessage } from '../../../shared/types';
import { FakeTimers } from '../../../test-support/fake-timers';
import { NOTCH_FULL_MS, NOTCH_PEEK_MS, NOTCH_RETRACT_AT_MS } from '../notch-phase';

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

function iso(ms: number): string {
	return new Date(ms).toISOString();
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

	it('hover over collapsed notch opens history', async () => {
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
		expect(result.current.ui).toBe('open');
		expect(result.current.reopening).toBe(true);
		expect(result.current.phase).toBe('peek');
		expect(setInteractiveSpy).toHaveBeenLastCalledWith(true);
	});

	it('hover target opens history while phase is full', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage());
		});
		expect(result.current.phase).toBe('full');
		expect(result.current.ui).toBe('collapsed');

		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('open');
		expect(result.current.reopening).toBe(true);
	});

	it('mouse leave from hover-reopen returns to collapsed', async () => {
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
		expect(result.current.ui).toBe('open');

		await act(async () => {
			result.current.scheduleHoverLeave();
			timers.advance(150);
		});
		expect(result.current.ui).toBe('collapsed');
	});

	it('mouse leave from open collapses back to phase-driven sliver', async () => {
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
		expect(result.current.ui).toBe('open');

		await act(async () => {
			result.current.scheduleHoverLeave();
			timers.advance(150);
		});
		expect(result.current.ui).toBe('collapsed');
	});

	it('closeReply re-arms a leave that was suppressed while reply was open', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'reply me' }));
		});
		await act(async () => {
			timers.advance(5_000);
		});
		await act(async () => {
			result.current.reopenFromHoverTarget();
		});
		expect(result.current.ui).toBe('open');

		const entry = result.current.history[0];
		await act(async () => {
			result.current.openReply(entry);
		});
		expect(result.current.replyOpen).toBe(true);

		await act(async () => {
			result.current.scheduleHoverLeave();
		});
		expect(result.current.ui).toBe('open');

		await act(async () => {
			result.current.closeReply();
			timers.advance(150);
		});
		expect(result.current.replyOpen).toBe(false);
		expect(result.current.ui).toBe('collapsed');
	});

	it('hover ceiling clears stuck open UI in peek', async () => {
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
		expect(result.current.ui).toBe('open');

		await act(async () => {
			timers.advance(8_000);
		});
		expect(result.current.ui).toBe('collapsed');
	});

	it('timer expiry still prunes while hover-reopened', async () => {
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
		expect(result.current.ui).toBe('open');

		await act(async () => {
			timers.advance(55_000);
		});
		expect(result.current.history.length).toBe(0);
		expect(result.current.newest).toBeNull();
		expect(result.current.ui).toBe('collapsed');
	});

	it('hover-stuck repro: hover-reopen does not block empty-hide', async () => {
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
		expect(result.current.ui).toBe('open');

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

	it('hover-reopen keeps the notch interactive in peek phase', async () => {
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
		expect(result.current.ui).toBe('open');
		expect(result.current.reopening).toBe(true);
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
				timers.advance(5_000);
			});
			expect(result.current.phase).toBe('peek');

			await act(async () => {
				result.current.reopenFromHoverTarget();
			});
			expect(result.current.ui).toBe('open');
			expect(result.current.unread).toBe(false);

			await act(async () => {
				result.current.scheduleHoverLeave();
				timers.advance(150);
			});
			await act(async () => {
				timers.advance(30_000);
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
				timers.advance(5_000);
			});
			await act(async () => {
				result.current.reopenFromHoverTarget();
			});
			await act(async () => {
				result.current.scheduleHoverLeave();
				timers.advance(150);
			});
			await act(async () => {
				timers.advance(30_000);
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

	it('appendOwnMessage prepends history without resetting phase or reply', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'incoming', senderMemberId: 'them' }));
		});
		expect(result.current.phase).toBe('full');
		const incomingId = result.current.newest?.id;
		expect(incomingId).toBeTruthy();

		await act(async () => {
			result.current.openReply(result.current.newest!);
			result.current.appendOwnMessage({
				sender: 'Me',
				senderMemberId: 'me',
				text: 'my reply',
				isDirect: false,
				group: 'test-circle',
				groupColor: '#3b82f6',
				receivedAt: new Date().toISOString(),
				silent: true,
			});
		});

		expect(result.current.history[0]?.text).toBe('my reply');
		expect(result.current.history[0]?.isOwn).toBe(true);
		expect(result.current.newest?.id).toBe(incomingId);
		expect(result.current.newest?.text).toBe('incoming');
		expect(result.current.replyOpen).toBe(true);
		expect(result.current.phase).toBe('full');
	});

	it('two messages in one tick: the older one, arriving last, does not become the fresh newest', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			timers.advance(20_000);
			result.current.onNotchMessage(makeMessage({ text: 'newer', sentAt: iso(15_000), receivedAt: iso(10_000) }));
			result.current.onNotchMessage(makeMessage({ text: 'older', sentAt: iso(5_000), receivedAt: iso(20_000) }));
		});
		expect(result.current.history.map((e) => e.text)).toEqual(['newer', 'older']);
		expect(result.current.newest?.text).toBe('newer');
		expect(result.current.phase).toBe('full');

		await act(async () => {
			timers.advance(50_000);
		});
		expect(result.current.newest?.text).toBe('older');
		expect(result.current.phase).toBe('retracted');
	});

	it('orders an own DM echo by its sentAt among incoming messages', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			timers.advance(30_000);
		});
		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'incoming', senderMemberId: 'them', sentAt: iso(20_000), receivedAt: iso(30_000) }));
			result.current.onNotchMessage(makeMessage({
				text: 'mine', sender: 'Me', senderMemberId: 'me', recipientMemberId: 'them',
				isDirect: true, isOwn: true, sentAt: iso(10_000), receivedAt: iso(30_000),
			}));
		});

		expect(result.current.history.map((e) => e.text)).toEqual(['incoming', 'mine']);
		expect(result.current.newest?.text).toBe('incoming');
	});

	it('seeds the phase from the receivedAt of the entry that becomes newest after the previous newest ages out', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			timers.advance(10_000);
			result.current.onNotchMessage(makeMessage({ text: 'ahead', sentAt: iso(25_000) }));
		});
		await act(async () => {
			timers.advance(20_000);
			result.current.onNotchMessage(makeMessage({ text: 'behind', sentAt: iso(5_000) }));
		});
		expect(result.current.newest?.text).toBe('ahead');

		await act(async () => {
			timers.advance(40_000);
		});

		expect(result.current.newest?.text).toBe('behind');
		expect(result.current.phase).toBe('retracted');
	});

	it('a late older message does not restart the phase of the current newest', async () => {
		const { result } = renderHook(useNotchLifecycle);
		await act(async () => {
			timers.advance(20_000);
			result.current.onNotchMessage(makeMessage({ text: 'newer', sentAt: iso(20_000) }));
		});
		await act(async () => {
			timers.advance(NOTCH_FULL_MS);
		});
		expect(result.current.phase).toBe('peek');

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'older', sentAt: iso(10_000) }));
		});

		expect(result.current.newest?.text).toBe('newer');
		expect(result.current.phase).toBe('peek');
	});

	it('an incoming message keeps the reply open on its target', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'target', senderMemberId: 'them' }));
		});
		await act(async () => {
			result.current.openReply(result.current.newest!);
		});
		const targetId = result.current.replyingTo;

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'incoming', senderMemberId: 'them' }));
		});

		expect(result.current.replyOpen).toBe(true);
		expect(result.current.replyingTo).toBe(targetId);
	});

	it('runs full → peek → retracted for a genuinely new message using exported phase constants', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'fresh' }));
		});
		expect(result.current.phase).toBe('full');

		await act(async () => {
			timers.advance(NOTCH_FULL_MS);
		});
		expect(result.current.phase).toBe('peek');

		await act(async () => {
			timers.advance(NOTCH_PEEK_MS);
		});
		expect(result.current.phase).toBe('retracted');
		expect(NOTCH_FULL_MS + NOTCH_PEEK_MS).toBe(NOTCH_RETRACT_AT_MS);
	});

	it('appends an own DM echo as an isOwn history entry without driving the phase', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'incoming', senderMemberId: 'them' }));
		});
		const incomingId = result.current.newest?.id;

		await act(async () => {
			result.current.onNotchMessage(
				makeMessage({
					text: 'to them',
					sender: 'Me',
					senderMemberId: 'me',
					recipientMemberId: 'them',
					isDirect: true,
					isOwn: true,
				}),
			);
		});

		expect(result.current.history[0]?.text).toBe('to them');
		expect(result.current.history[0]?.isOwn).toBe(true);
		expect(result.current.newest?.id).toBe(incomingId);
		expect(result.current.phase).toBe('full');
	});

	it('drops an own broadcast echo: no history entry and no phase change (as before #123)', async () => {
		const { result } = renderHook(useNotchLifecycle);

		await act(async () => {
			result.current.onNotchMessage(makeMessage({ text: 'incoming', senderMemberId: 'them' }));
		});
		const incomingId = result.current.newest?.id;

		await act(async () => {
			result.current.onNotchMessage(
				makeMessage({ text: 'my broadcast', sender: 'Me', senderMemberId: 'me', isOwn: true, isDirect: false }),
			);
		});

		expect(result.current.history.some((entry) => entry.text === 'my broadcast')).toBe(false);
		expect(result.current.history.length).toBe(1);
		expect(result.current.newest?.id).toBe(incomingId);
		expect(result.current.phase).toBe('full');
	});
});
