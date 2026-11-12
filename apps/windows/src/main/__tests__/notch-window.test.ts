import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { BrowserWindow } from 'electron';
import { focusNotchForReply, unfocusNotchAfterReply } from '../notch-focus';

const mockDisplay = {
	workArea: { x: 0, y: 0, width: 1920, height: 1040 },
	workAreaSize: { width: 1440 },
};

mock.module('electron', () => ({
	BrowserWindow: class BrowserWindow {},
	screen: {
		getPrimaryDisplay: () => mockDisplay,
		getDisplayNearestPoint: () => mockDisplay,
	},
}));

const {
	requestNotchHide,
	showNotch,
	clampNotchHeight,
	resizeNotchToContent,
	setNotchPreviewActive,
	isNotchPreviewActive,
	NOTCH_WIDTH,
	NOTCH_DEFAULT_HEIGHT,
	NOTCH_MIN_HEIGHT,
	NOTCH_MAX_HEIGHT,
} = await import('../notch-window');

class FakeTimers {
	private now = 0;
	private nextId = 1;
	private readonly timers = new Map<number, { at: number; callback: () => void }>();
	private readonly originalSetTimeout = globalThis.setTimeout;
	private readonly originalClearTimeout = globalThis.clearTimeout;

	install(): void {
		globalThis.setTimeout = ((callback: ((...args: never[]) => void) | string, delay?: number) => {
			const id = this.nextId++;
			const runAt = this.now + Math.max(0, Number(delay ?? 0));
			const timerCallback =
				typeof callback === 'function'
					? callback
					: () => {
							throw new Error('string setTimeout callbacks are unsupported in this test');
						};
			this.timers.set(id, { at: runAt, callback: timerCallback as () => void });
			return id as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout;
		globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
			this.timers.delete(Number(id));
		}) as typeof clearTimeout;
	}

	tick(ms: number): void {
		const target = this.now + ms;
		while (true) {
			const nextTimer = [...this.timers.entries()]
				.sort((a, b) => a[1].at - b[1].at)[0];
			if (!nextTimer || nextTimer[1].at > target) break;
			this.timers.delete(nextTimer[0]);
			this.now = nextTimer[1].at;
			nextTimer[1].callback();
		}
		this.now = target;
	}

	uninstall(): void {
		this.timers.clear();
		globalThis.setTimeout = this.originalSetTimeout;
		globalThis.clearTimeout = this.originalClearTimeout;
	}
}

function mockNotchWindow(): {
	setFocusable(value: boolean): void;
	show(): void;
	focus(): void;
	blur(): void;
	showInactive(): void;
	hide(): void;
	webContents: { send(channel: string): void };
	calls: string[];
} {
	const calls: string[] = [];
	return {
		calls,
		setFocusable: (value: boolean) => {
			calls.push(`setFocusable:${value}`);
		},
		show: () => {
			calls.push('show');
		},
		focus: () => {
			calls.push('focus');
		},
		blur: () => {
			calls.push('blur');
		},
		showInactive: () => {
			calls.push('showInactive');
		},
		hide: () => {
			calls.push('hide');
		},
		webContents: {
			send: (channel: string) => {
				calls.push(`send:${channel}`);
			},
		},
	};
}

let timers: FakeTimers;

beforeEach(() => {
	timers = new FakeTimers();
	timers.install();
});

afterEach(() => {
	timers.uninstall();
});

describe('notch-focus', () => {
	it('focusNotchForReply enables focus and activates the window', () => {
		const win = mockNotchWindow();
		focusNotchForReply(win);
		expect(win.calls).toEqual(['setFocusable:true', 'show', 'focus']);
	});

	it('unfocusNotchAfterReply blurs and restores non-focusable state', () => {
		const win = mockNotchWindow();
		unfocusNotchAfterReply(win);
		expect(win.calls).toEqual(['blur', 'setFocusable:false']);
	});

	it('focus/unfocus helpers are no-ops for null', () => {
		expect(() => focusNotchForReply(null)).not.toThrow();
		expect(() => unfocusNotchAfterReply(null)).not.toThrow();
	});
});

describe('notch-window', () => {
	it('clears a pending hide when a new message arrives before the 250ms hide fires', () => {
		const win = mockNotchWindow() as unknown as BrowserWindow;

		requestNotchHide(win);
		timers.tick(100);
		showNotch(win);
		timers.tick(500);

		expect((win as unknown as ReturnType<typeof mockNotchWindow>).calls).toContain('send:notch-hide');
		expect((win as unknown as ReturnType<typeof mockNotchWindow>).calls).toContain('send:notch-show');
		expect((win as unknown as ReturnType<typeof mockNotchWindow>).calls).not.toContain('hide');
	});
});

describe('notch-window sizing (P1.3 / WIN-NOTCH-004)', () => {
	function mockResizableWindow(initialHeight: number) {
		const calls: Array<[string, ...unknown[]]> = [];
		let resizable = false;
		let size: [number, number] = [NOTCH_WIDTH, initialHeight];
		return {
			calls,
			getSize: () => size,
			isResizable: () => resizable,
			setResizable: (value: boolean) => {
				resizable = value;
				calls.push(['setResizable', value]);
			},
			setSize: (w: number, h: number) => {
				size = [w, h];
				calls.push(['setSize', w, h]);
			},
		};
	}

	it('uses a compact width close to the macOS reference (was 360)', () => {
		expect(NOTCH_WIDTH).toBeLessThan(360);
		expect(NOTCH_WIDTH).toBeLessThanOrEqual(280);
	});

	it('default height is not larger than the old hardcoded 260', () => {
		expect(NOTCH_DEFAULT_HEIGHT).toBeLessThanOrEqual(260);
	});

	it('clampNotchHeight passes through content heights within bounds (rounded up)', () => {
		expect(clampNotchHeight(200)).toBe(200);
		expect(clampNotchHeight(199.2)).toBe(200);
	});

	it('clampNotchHeight clamps to min/max bounds', () => {
		expect(clampNotchHeight(1)).toBe(NOTCH_MIN_HEIGHT);
		expect(clampNotchHeight(10_000)).toBe(NOTCH_MAX_HEIGHT);
	});

	it('clampNotchHeight passes exact boundary values through unchanged', () => {
		// Regression guard: an off-by-one in the Math.max/min clamp (e.g. `<`
		// instead of `<=`) would nudge the exact bounds to 41/479 silently.
		expect(clampNotchHeight(NOTCH_MIN_HEIGHT)).toBe(NOTCH_MIN_HEIGHT);
		expect(clampNotchHeight(NOTCH_MAX_HEIGHT)).toBe(NOTCH_MAX_HEIGHT);
		expect(clampNotchHeight(NOTCH_MIN_HEIGHT + 0.4)).toBe(NOTCH_MIN_HEIGHT + 1);
		expect(clampNotchHeight(NOTCH_MAX_HEIGHT + 0.1)).toBe(NOTCH_MAX_HEIGHT);
	});

	it('clampNotchHeight falls back to the default for invalid input', () => {
		expect(clampNotchHeight(Number.NaN)).toBe(NOTCH_DEFAULT_HEIGHT);
		expect(clampNotchHeight(Number.POSITIVE_INFINITY)).toBe(NOTCH_DEFAULT_HEIGHT);
		expect(clampNotchHeight(0)).toBe(NOTCH_DEFAULT_HEIGHT);
		expect(clampNotchHeight(-5)).toBe(NOTCH_DEFAULT_HEIGHT);
	});

	it('resizeNotchToContent resizes only the height, keeping the width fixed', () => {
		const win = mockResizableWindow(NOTCH_DEFAULT_HEIGHT);
		resizeNotchToContent(win as unknown as BrowserWindow, 320);
		expect(win.calls).toContainEqual(['setSize', NOTCH_WIDTH, 320]);
		expect(win.getSize()).toEqual([NOTCH_WIDTH, 320]);
	});

	it('resizeNotchToContent restores the non-resizable state after resizing', () => {
		const win = mockResizableWindow(NOTCH_DEFAULT_HEIGHT);
		resizeNotchToContent(win as unknown as BrowserWindow, 320);
		expect(win.calls[0]).toEqual(['setResizable', true]);
		expect(win.calls.at(-1)).toEqual(['setResizable', false]);
		expect(win.isResizable()).toBe(false);
	});

	it('resizeNotchToContent is a no-op when the height is unchanged or the window is null', () => {
		const win = mockResizableWindow(200);
		resizeNotchToContent(win as unknown as BrowserWindow, 200);
		expect(win.calls.length).toBe(0);
		expect(() => resizeNotchToContent(null, 200)).not.toThrow();
	});

	it('resizeNotchToContent tolerates a 1px difference from display-scaling rounding without resizing', () => {
		// Windows display scaling (125 %/150 %) can round the renderer's
		// reported offsetHeight differently than the window's actual height,
		// which would otherwise retrigger the renderer ResizeObserver and
		// oscillate. A +-1px difference must be a no-op.
		const winUp = mockResizableWindow(200);
		resizeNotchToContent(winUp as unknown as BrowserWindow, 201);
		expect(winUp.calls.length).toBe(0);

		const winDown = mockResizableWindow(200);
		resizeNotchToContent(winDown as unknown as BrowserWindow, 199);
		expect(winDown.calls.length).toBe(0);
	});

	it('resizeNotchToContent still resizes once the difference exceeds the 1px tolerance', () => {
		const win = mockResizableWindow(200);
		resizeNotchToContent(win as unknown as BrowserWindow, 202);
		expect(win.calls).toContainEqual(['setSize', NOTCH_WIDTH, 202]);
	});

	it('resizeNotchToContent clamps a retracted sliver height up to the minimum instead of shrinking to zero', () => {
		// The retracted/peek states report a tiny offsetHeight (the sliver
		// grabber); resizeNotchToContent must still land on NOTCH_MIN_HEIGHT
		// rather than passing the raw sub-minimum value to setSize.
		const win = mockResizableWindow(NOTCH_DEFAULT_HEIGHT);
		resizeNotchToContent(win as unknown as BrowserWindow, 6);
		expect(win.calls).toContainEqual(['setSize', NOTCH_WIDTH, NOTCH_MIN_HEIGHT]);
	});

	it('resizeNotchToContent falls back to the default height for NaN/negative renderer reports instead of crashing', () => {
		const win = mockResizableWindow(NOTCH_DEFAULT_HEIGHT + 50);
		resizeNotchToContent(win as unknown as BrowserWindow, Number.NaN);
		expect(win.calls).toContainEqual(['setSize', NOTCH_WIDTH, NOTCH_DEFAULT_HEIGHT]);

		const win2 = mockResizableWindow(NOTCH_DEFAULT_HEIGHT + 50);
		resizeNotchToContent(win2 as unknown as BrowserWindow, -100);
		expect(win2.calls).toContainEqual(['setSize', NOTCH_WIDTH, NOTCH_DEFAULT_HEIGHT]);
	});
});

describe('setNotchPreviewActive (Plan 14 task 6 — wide notch bounds)', () => {
	function mockPreviewWindow(initialBounds: Electron.Rectangle) {
		const calls: Array<[string, ...unknown[]]> = [];
		let resizable = false;
		let bounds = initialBounds;
		return {
			calls,
			getBounds: () => bounds,
			setBounds: (next: Electron.Rectangle) => {
				bounds = next;
				calls.push(['setBounds', next]);
			},
			isResizable: () => resizable,
			setResizable: (value: boolean) => {
				resizable = value;
				calls.push(['setResizable', value]);
			},
			setIgnoreMouseEvents: (value: boolean, opts?: { forward: boolean }) => {
				calls.push(['setIgnoreMouseEvents', value, opts]);
			},
			setFocusable: (value: boolean) => {
				calls.push(['setFocusable', value]);
			},
			focus: () => {
				calls.push(['focus']);
			},
			isDestroyed: () => false,
		};
	}

	// Module-level `previewActive`/`compactBounds` singleton state must not
	// leak between tests (there is exactly one real notch window at runtime).
	afterEach(() => {
		const win = mockPreviewWindow({ x: 0, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT });
		if (isNotchPreviewActive()) {
			setNotchPreviewActive(win as unknown as BrowserWindow, false);
		}
	});

	it('is inactive before any call', () => {
		expect(isNotchPreviewActive()).toBe(false);
	});

	it('widens the window to the nearest display work area and flips isNotchPreviewActive', () => {
		const compact = { x: 580, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT };
		const win = mockPreviewWindow(compact);

		setNotchPreviewActive(win as unknown as BrowserWindow, true);

		expect(isNotchPreviewActive()).toBe(true);
		expect(win.getBounds()).toEqual(mockDisplay.workArea);
		expect(win.calls).toContainEqual(['setBounds', mockDisplay.workArea]);
	});

	it('restores the exact saved compact bounds on deactivation', () => {
		const compact = { x: 580, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT };
		const win = mockPreviewWindow(compact);

		setNotchPreviewActive(win as unknown as BrowserWindow, true);
		setNotchPreviewActive(win as unknown as BrowserWindow, false);

		expect(isNotchPreviewActive()).toBe(false);
		expect(win.getBounds()).toEqual(compact);
	});

	it('briefly lifts and restores the non-resizable lock around the bounds change', () => {
		const win = mockPreviewWindow({ x: 0, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT });

		setNotchPreviewActive(win as unknown as BrowserWindow, true);

		expect(win.calls[0]).toEqual(['setResizable', true]);
		expect(win.calls.at(-1)).toEqual(['setResizable', false]);
		expect(win.isResizable()).toBe(false);
	});

	it('steals focus and disables click-through while the preview is active', () => {
		const win = mockPreviewWindow({ x: 0, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT });

		setNotchPreviewActive(win as unknown as BrowserWindow, true);

		expect(win.calls).toContainEqual(['setIgnoreMouseEvents', false, { forward: true }]);
		expect(win.calls).toContainEqual(['setFocusable', true]);
		expect(win.calls).toContainEqual(['focus']);

		setNotchPreviewActive(win as unknown as BrowserWindow, false);
		expect(win.calls).toContainEqual(['setFocusable', false]);
	});

	it('is a no-op when called with the already-active state (idempotent)', () => {
		const win = mockPreviewWindow({ x: 0, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT });

		setNotchPreviewActive(win as unknown as BrowserWindow, true);
		const callsAfterFirst = win.calls.length;
		setNotchPreviewActive(win as unknown as BrowserWindow, true);

		expect(win.calls.length).toBe(callsAfterFirst);
	});

	it('is a no-op for a destroyed window', () => {
		const win = mockPreviewWindow({ x: 0, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT });
		(win as { isDestroyed?: () => boolean }).isDestroyed = () => true;
		expect(() => setNotchPreviewActive(win as unknown as BrowserWindow, true)).not.toThrow();
		expect(isNotchPreviewActive()).toBe(false);
	});

	it('is a no-op for a null window', () => {
		expect(() => setNotchPreviewActive(null, true)).not.toThrow();
		expect(isNotchPreviewActive()).toBe(false);
	});

	it('resizeNotchToContent ignores content-size requests while the preview is active', () => {
		const compact = { x: 0, y: 0, width: NOTCH_WIDTH, height: NOTCH_DEFAULT_HEIGHT };
		const previewWin = mockPreviewWindow(compact);
		setNotchPreviewActive(previewWin as unknown as BrowserWindow, true);

		const calls: Array<[string, ...unknown[]]> = [];
		let size: [number, number] = [NOTCH_WIDTH, NOTCH_DEFAULT_HEIGHT];
		const resizeWin = {
			getSize: () => size,
			isResizable: () => false,
			setResizable: (value: boolean) => calls.push(['setResizable', value]),
			setSize: (w: number, h: number) => {
				size = [w, h];
				calls.push(['setSize', w, h]);
			},
		};
		resizeNotchToContent(resizeWin as unknown as BrowserWindow, 320);

		expect(calls.length).toBe(0);
		expect(resizeWin.getSize()).toEqual([NOTCH_WIDTH, NOTCH_DEFAULT_HEIGHT]);
	});
});
