import { describe, expect, it } from 'bun:test';
import {
	createHoverCopyController,
	handleNotchSetInteractive,
	wireHoverCopyDisarm,
	type GlobalShortcutApi,
	type HoverCopyWindowLike,
} from '../hover-copy-shortcut';

function mockShortcutApi(options?: { registerReturns?: boolean }): {
	api: GlobalShortcutApi;
	registerCalls: Array<{ accelerator: string; callback: () => void }>;
	unregisterCalls: string[];
} {
	const registerCalls: Array<{ accelerator: string; callback: () => void }> = [];
	const unregisterCalls: string[] = [];
	return {
		registerCalls,
		unregisterCalls,
		api: {
			register: (accelerator, callback) => {
				registerCalls.push({ accelerator, callback });
				return options?.registerReturns ?? true;
			},
			unregister: (accelerator) => {
				unregisterCalls.push(accelerator);
			},
		},
	};
}

function wait(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('createHoverCopyController (Plan 12 P3.2)', () => {
	it('registers the bare "C" accelerator when activated and reports success', () => {
		const { api, registerCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		const ok = controller.setActive(true);

		expect(ok).toBe(true);
		expect(registerCalls).toHaveLength(1);
		expect(registerCalls[0]?.accelerator).toBe('C');
		expect(controller.isActive).toBe(true);
		controller.dispose();
	});

	it('invokes the trigger callback when the registered accelerator fires', () => {
		const { api, registerCalls } = mockShortcutApi();
		let triggered = 0;
		const controller = createHoverCopyController(() => {
			triggered += 1;
		}, api);

		controller.setActive(true);
		registerCalls[0]?.callback();

		expect(triggered).toBe(1);
		controller.dispose();
	});

	it('unregisters "C" when deactivated and reports success', () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		const ok = controller.setActive(false);

		expect(ok).toBe(true);
		expect(unregisterCalls).toEqual(['C']);
		expect(controller.isActive).toBe(false);
	});

	it('treats repeated setActive(true) as activity pings — registers only once', () => {
		const { api, registerCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		expect(controller.setActive(true)).toBe(true);
		expect(controller.setActive(true)).toBe(true);
		expect(controller.setActive(true)).toBe(true);

		expect(registerCalls).toHaveLength(1);
		controller.dispose();
	});

	it('is idempotent: setActive(false) without a prior activation never unregisters', () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(false);

		expect(unregisterCalls).toEqual([]);
	});

	it('returns false and does not mark itself active when the OS registration fails', () => {
		const { api, unregisterCalls } = mockShortcutApi({ registerReturns: false });
		const controller = createHoverCopyController(() => {}, api);

		const ok = controller.setActive(true);

		expect(ok).toBe(false);
		expect(controller.isActive).toBe(false);

		// A subsequent setActive(false) must not attempt to unregister a
		// shortcut that was never actually registered.
		controller.setActive(false);
		expect(unregisterCalls).toEqual([]);
	});

	it('supports re-activation after deactivation', () => {
		const { api, registerCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		controller.setActive(false);
		controller.setActive(true);

		expect(registerCalls).toHaveLength(2);
		expect(controller.isActive).toBe(true);
		controller.dispose();
	});

	it('dispose() disarms and unregisters', () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		controller.dispose();

		expect(controller.isActive).toBe(false);
		expect(unregisterCalls).toEqual(['C']);
	});
});

describe('hover-copy idle disarm (review CRITICAL 3)', () => {
	it('auto-disarms after idleMs without an activity ping', async () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api, { idleMs: 25 });

		controller.setActive(true);
		expect(controller.isActive).toBe(true);

		await wait(60);

		expect(controller.isActive).toBe(false);
		expect(unregisterCalls).toEqual(['C']);
	});

	it('activity pings (setActive(true) while armed) push the idle deadline out', async () => {
		const { api, registerCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api, { idleMs: 50 });

		controller.setActive(true);
		await wait(25);
		controller.setActive(true); // ping — resets the 50ms deadline
		await wait(25);
		controller.setActive(true); // ping again
		await wait(25);

		// 75ms elapsed since first arm, but never 50ms without a ping.
		expect(controller.isActive).toBe(true);
		expect(registerCalls).toHaveLength(1); // pings never re-register

		await wait(80);
		expect(controller.isActive).toBe(false);
	});

	it('an explicit disarm cancels the pending idle timer (no double unregister later)', async () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api, { idleMs: 25 });

		controller.setActive(true);
		controller.setActive(false);
		expect(unregisterCalls).toEqual(['C']);

		await wait(60);
		expect(unregisterCalls).toEqual(['C']); // idle timer did not fire a second unregister
	});
});

describe('hover-copy Late-Ping-Race gate (Iteration-5 re-review follow-up)', () => {
	it('rejects a late activity ping arriving after the notch is no longer visible+interactive', () => {
		const { api, registerCalls, unregisterCalls } = mockShortcutApi();
		let armable = true;
		const controller = createHoverCopyController(() => {}, api, { canArm: () => armable });

		// Genuine hover: notch is visible+interactive, arms normally.
		expect(controller.setActive(true)).toBe(true);
		expect(registerCalls).toHaveLength(1);

		// interactive(false) fired (e.g. handleNotchSetInteractive) and
		// explicitly disarmed the controller.
		armable = false;
		controller.setActive(false);
		expect(unregisterCalls).toEqual(['C']);

		// A stale activity ping — queued before the disarm, delivered after —
		// arrives. It must not re-arm the shortcut.
		const ok = controller.setActive(true);

		expect(ok).toBe(false);
		expect(controller.isActive).toBe(false);
		expect(registerCalls).toHaveLength(1); // no second registration
	});

	it('accepts a fresh arm once canArm reports visible+interactive again', () => {
		const { api, registerCalls } = mockShortcutApi();
		let armable = false;
		const controller = createHoverCopyController(() => {}, api, { canArm: () => armable });

		expect(controller.setActive(true)).toBe(false);
		expect(controller.isActive).toBe(false);

		armable = true;
		expect(controller.setActive(true)).toBe(true);
		expect(controller.isActive).toBe(true);
		expect(registerCalls).toHaveLength(1);
		controller.dispose();
	});

	it('does not re-check canArm for activity pings on an already-armed controller', () => {
		const { api, registerCalls } = mockShortcutApi();
		let armable = true;
		const controller = createHoverCopyController(() => {}, api, { canArm: () => armable });

		expect(controller.setActive(true)).toBe(true);
		armable = false; // gate flips after arming, but controller is still active

		// A ping while already active is treated as activity, not a fresh arm
		// — it must not be rejected just because canArm() would now say no
		// (the explicit disarm path, e.g. handleNotchSetInteractive, is what
		// actually flips `active` to false; this only guards re-arming).
		expect(controller.setActive(true)).toBe(true);
		expect(controller.isActive).toBe(true);
		expect(registerCalls).toHaveLength(1);
	});
});

describe('hover-copy trigger resets the idle deadline (idle-UX follow-up)', () => {
	it('a successful "C" trigger extends the idle deadline like an explicit ping', async () => {
		const { api, registerCalls, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api, { idleMs: 50 });

		controller.setActive(true);
		await wait(25);
		registerCalls[0]?.callback(); // simulate a real "C" press
		await wait(35);

		// 60ms elapsed since arm, but the trigger at 25ms reset the 50ms
		// deadline, so the shortcut must still be armed.
		expect(controller.isActive).toBe(true);

		await wait(30);
		expect(controller.isActive).toBe(false);
		expect(unregisterCalls).toEqual(['C']);
	});
});

type Listener = () => void;

function mockWindow(): {
	win: HoverCopyWindowLike;
	emitHide: () => void;
	emitRendererGone: () => void;
	emitDestroyed: () => void;
} {
	const windowListeners = new Map<string, Listener[]>();
	const contentsListeners = new Map<string, Listener[]>();
	const add = (map: Map<string, Listener[]>, event: string, listener: Listener) => {
		map.set(event, [...(map.get(event) ?? []), listener]);
	};
	const remove = (map: Map<string, Listener[]>, event: string, listener: Listener) => {
		map.set(event, (map.get(event) ?? []).filter((existing) => existing !== listener));
	};
	const emit = (map: Map<string, Listener[]>, event: string) => {
		for (const listener of map.get(event) ?? []) listener();
	};
	return {
		win: {
			on: (event, listener) => add(windowListeners, event, listener),
			off: (event, listener) => remove(windowListeners, event, listener),
			webContents: {
				on: (event, listener) => add(contentsListeners, event, listener),
				off: (event, listener) => remove(contentsListeners, event, listener),
			},
		},
		emitHide: () => emit(windowListeners, 'hide'),
		emitRendererGone: () => emit(contentsListeners, 'render-process-gone'),
		emitDestroyed: () => emit(contentsListeners, 'destroyed'),
	};
}

describe('wireHoverCopyDisarm — main-owned disarm paths (review CRITICALs 1 + 2)', () => {
	it('disarms when the notch window hides (hide without mouseleave)', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);
		const { win, emitHide } = mockWindow();
		wireHoverCopyDisarm(controller, win);

		controller.setActive(true);
		expect(controller.isActive).toBe(true);

		emitHide();

		expect(controller.isActive).toBe(false);
	});

	it('disarms when the renderer process crashes (render-process-gone)', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);
		const { win, emitRendererGone } = mockWindow();
		wireHoverCopyDisarm(controller, win);

		controller.setActive(true);
		emitRendererGone();

		expect(controller.isActive).toBe(false);
	});

	it('disarms when the webContents is destroyed', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);
		const { win, emitDestroyed } = mockWindow();
		wireHoverCopyDisarm(controller, win);

		controller.setActive(true);
		emitDestroyed();

		expect(controller.isActive).toBe(false);
	});

	it('returns a dispose handle that removes the listeners it registered', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);
		const { win, emitHide } = mockWindow();
		const dispose = wireHoverCopyDisarm(controller, win);

		controller.setActive(true);
		dispose();
		emitHide();

		// The listener was removed by dispose(), so hide no longer disarms.
		expect(controller.isActive).toBe(true);
		controller.dispose();
	});

	it('guards against wiring the same window twice (no duplicate disarm registration)', () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);
		const { win, emitHide } = mockWindow();

		wireHoverCopyDisarm(controller, win);
		wireHoverCopyDisarm(controller, win); // duplicate wire — should be a no-op

		controller.setActive(true);
		emitHide();

		// A single 'C' unregister, not two, proves the disarm handler wasn't
		// registered twice for the same window.
		expect(unregisterCalls).toEqual(['C']);
	});

	it('dispose() lets a window be re-wired afterward', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);
		const { win, emitHide } = mockWindow();

		const dispose = wireHoverCopyDisarm(controller, win);
		dispose();

		// Re-wiring after dispose() must work (not treated as a duplicate).
		wireHoverCopyDisarm(controller, win);
		controller.setActive(true);
		emitHide();

		expect(controller.isActive).toBe(false);
	});
});

describe('handleNotchSetInteractive — disarm on click-through transition (review CRITICAL 2)', () => {
	it('disarms when the notch becomes non-interactive (setIgnoreMouseEvents(true))', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		handleNotchSetInteractive(controller, false);

		expect(controller.isActive).toBe(false);
	});

	it('leaves the armed state alone when the notch becomes interactive', () => {
		const { api } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		handleNotchSetInteractive(controller, true);

		expect(controller.isActive).toBe(true);
		controller.dispose();
	});

	it('tolerates a null controller (startup ordering)', () => {
		expect(() => handleNotchSetInteractive(null, false)).not.toThrow();
	});
});
