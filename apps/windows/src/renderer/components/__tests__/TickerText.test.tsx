import { describe, expect, it, afterEach } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { TickerText } from '../TickerText';

/**
 * Deterministic fake timer, mirroring the one already proven safe in
 * NotchWidget.test.tsx (same package/pattern) — scoped locally so it can
 * never leak into other test files.
 */
class FakeTimers {
	private now = 0;
	private nextId = 1;
	private readonly timers = new Map<number, { fn: () => void; time: number }>();
	private readonly original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };

	install() {
		globalThis.setTimeout = ((fn: () => void, delay = 0) => {
			const id = this.nextId++;
			this.timers.set(id, { fn, time: this.now + delay });
			return id;
		}) as typeof setTimeout;
		globalThis.clearTimeout = ((id: number | undefined) => {
			if (id !== undefined) this.timers.delete(id);
		}) as typeof clearTimeout;
	}

	restore() {
		globalThis.setTimeout = this.original.setTimeout;
		globalThis.clearTimeout = this.original.clearTimeout;
	}

	advance(ms: number) {
		this.now += ms;
		const due = [...this.timers.entries()]
			.filter(([, timer]) => timer.time <= this.now)
			.sort((a, b) => a[1].time - b[1].time);
		for (const [id, timer] of due) {
			if (!this.timers.has(id)) continue;
			this.timers.delete(id);
			timer.fn();
		}
	}
}

/** Same mock object serves both the container-div and text-span refs — each
 * reads a different property off it (`clientWidth` vs `scrollWidth`). */
function nodeMock(clientWidth: number, scrollWidth: number) {
	return () => ({ clientWidth, scrollWidth });
}

function tickerClasses(root: ReturnType<typeof create>): string[] {
	const node = root.root.findByProps({ 'data-testid': 'ticker' });
	return String(node.props.className).split(' ');
}

let currentRoot: ReturnType<typeof create> | undefined;

afterEach(async () => {
	if (currentRoot) {
		await act(async () => {
			currentRoot!.unmount();
		});
		currentRoot = undefined;
	}
});

describe('TickerText static (fits) text', () => {
	it('renders without the scrolling/overflowing classes when the text fits the measured width', async () => {
		let finishedCalls = 0;
		await act(async () => {
			currentRoot = create(
				<TickerText text="short" onFinished={() => finishedCalls++} />,
				{ createNodeMock: nodeMock(300, 100) },
			);
		});

		const classes = tickerClasses(currentRoot!);
		expect(classes).toContain('ticker');
		expect(classes).not.toContain('ticker-overflowing');
		expect(classes).not.toContain('ticker-scrolling');
		expect(classes).not.toContain('ticker-moving');
	});

	it('calls onFinished exactly once, immediately, for text that fits', async () => {
		let finishedCalls = 0;
		await act(async () => {
			currentRoot = create(
				<TickerText text="short" onFinished={() => finishedCalls++} />,
				{ createNodeMock: nodeMock(300, 100) },
			);
		});

		expect(finishedCalls).toBe(1);
	});

	it('does not throw when onFinished is omitted', async () => {
		await act(async () => {
			currentRoot = create(<TickerText text="short" />, { createNodeMock: nodeMock(300, 100) });
		});
		// Reaching this line without the awaited act() throwing is the assertion.
		expect(currentRoot).toBeDefined();
	});
});

describe('TickerText overflowing (scrolling) text', () => {
	let timers: FakeTimers;

	function installTimers() {
		timers = new FakeTimers();
		timers.install();
	}

	afterEach(() => {
		timers?.restore();
	});

	it('gets the ticker-scrolling and ticker-overflowing classes when the text overflows', async () => {
		installTimers();
		await act(async () => {
			currentRoot = create(
				<TickerText text="a very long message that needs to scroll across the notch" />,
				{ createNodeMock: nodeMock(100, 400) },
			);
		});

		const classes = tickerClasses(currentRoot!);
		expect(classes).toContain('ticker-overflowing');
		expect(classes).toContain('ticker-scrolling');
	});

	it('the leading fade (ticker-moving) is absent at start and appears only after the standstill delay elapses', async () => {
		installTimers();
		await act(async () => {
			currentRoot = create(
				<TickerText text="a very long message that needs to scroll across the notch" />,
				{ createNodeMock: nodeMock(100, 400) },
			);
		});

		// Immediately after mount: still standing still, no leading fade yet.
		expect(tickerClasses(currentRoot!)).not.toContain('ticker-moving');

		// Advance past START_DELAY_MS (1.6s) — movement begins.
		await act(async () => {
			timers.advance(1_600);
		});

		expect(tickerClasses(currentRoot!)).toContain('ticker-moving');
	});

	it('does not start moving before the standstill delay elapses (e.g. at 1.5s)', async () => {
		installTimers();
		await act(async () => {
			currentRoot = create(
				<TickerText text="a very long message that needs to scroll across the notch" />,
				{ createNodeMock: nodeMock(100, 400) },
			);
		});

		await act(async () => {
			timers.advance(1_500);
		});

		expect(tickerClasses(currentRoot!)).not.toContain('ticker-moving');
	});

	it('calls onFinished exactly once, after the standstill delay plus the scroll duration', async () => {
		installTimers();
		let finishedCalls = 0;
		// overflow = 400 - 100 = 300px; + 14px end padding = 314px at 24px/s
		// = 13,083.33ms scroll duration (not a whole ms), on top of the
		// 1,600ms standstill — round the advance up so the fractional-ms
		// completion timer is genuinely due.
		await act(async () => {
			currentRoot = create(
				<TickerText text="a very long message that needs to scroll across the notch" onFinished={() => finishedCalls++} />,
				{ createNodeMock: nodeMock(100, 400) },
			);
		});

		await act(async () => {
			timers.advance(1_600); // standstill elapses, scroll starts
		});
		expect(finishedCalls).toBe(0);

		await act(async () => {
			timers.advance(13_084); // scroll duration elapses
		});
		expect(finishedCalls).toBe(1);

		// Advancing well past that must not fire it again.
		await act(async () => {
			timers.advance(10_000);
		});
		expect(finishedCalls).toBe(1);
	});

	it('does not call onFinished before the scroll has actually finished', async () => {
		installTimers();
		let finishedCalls = 0;
		await act(async () => {
			currentRoot = create(
				<TickerText text="a very long message that needs to scroll across the notch" onFinished={() => finishedCalls++} />,
				{ createNodeMock: nodeMock(100, 400) },
			);
		});

		await act(async () => {
			timers.advance(1_600 + 5_000); // standstill + partial scroll only
		});

		expect(finishedCalls).toBe(0);
	});
});

describe('TickerText prefers-reduced-motion', () => {
	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
	});

	it('renders a static, truncated ticker (no scrolling classes) and calls onFinished immediately, even for overflowing text', async () => {
		(globalThis as unknown as { window: { matchMedia: (q: string) => { matches: boolean } } }).window = {
			matchMedia: () => ({ matches: true }),
		};
		let finishedCalls = 0;

		await act(async () => {
			currentRoot = create(
				<TickerText text="a very long message that needs to scroll across the notch" onFinished={() => finishedCalls++} />,
				{ createNodeMock: nodeMock(100, 400) },
			);
		});

		const classes = tickerClasses(currentRoot!);
		expect(classes).toContain('ticker-overflowing');
		expect(classes).toContain('ticker-static-truncated');
		expect(classes).not.toContain('ticker-scrolling');
		expect(classes).not.toContain('ticker-moving');
		expect(finishedCalls).toBe(1);
	});

	it('does not render the static-truncated class for text that fits, even when reduced motion is preferred', async () => {
		(globalThis as unknown as { window: { matchMedia: (q: string) => { matches: boolean } } }).window = {
			matchMedia: () => ({ matches: true }),
		};

		await act(async () => {
			currentRoot = create(
				<TickerText text="short" />,
				{ createNodeMock: nodeMock(300, 100) },
			);
		});

		expect(tickerClasses(currentRoot!)).not.toContain('ticker-static-truncated');
	});
});

describe('TickerText re-render with the same text', () => {
	it('does not call onFinished a second time when re-rendered with unchanged text', async () => {
		let finishedCalls = 0;
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<TickerText text="short" onFinished={() => finishedCalls++} />,
				{ createNodeMock: nodeMock(300, 100) },
			);
		});
		expect(finishedCalls).toBe(1);

		await act(async () => {
			root!.update(<TickerText text="short" onFinished={() => finishedCalls++} />);
		});

		expect(finishedCalls).toBe(1);

		await act(async () => {
			root!.unmount();
		});
	});
});
