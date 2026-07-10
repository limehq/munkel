import { describe, expect, it } from 'bun:test';
import { createHoverCopyController, type GlobalShortcutApi } from '../hover-copy-shortcut';

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

describe('createHoverCopyController (Plan 12 P3.2)', () => {
	it('registers the bare "C" accelerator when activated', () => {
		const { api, registerCalls } = mockShortcutApi();
		const trigger = () => {};
		const controller = createHoverCopyController(trigger, api);

		controller.setActive(true);

		expect(registerCalls).toHaveLength(1);
		expect(registerCalls[0]?.accelerator).toBe('C');
		expect(controller.isActive).toBe(true);
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
	});

	it('unregisters "C" when deactivated', () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		controller.setActive(false);

		expect(unregisterCalls).toEqual(['C']);
		expect(controller.isActive).toBe(false);
	});

	it('is idempotent: repeated setActive(true) only registers once', () => {
		const { api, registerCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);
		controller.setActive(true);
		controller.setActive(true);

		expect(registerCalls).toHaveLength(1);
	});

	it('is idempotent: setActive(false) without a prior activation never unregisters', () => {
		const { api, unregisterCalls } = mockShortcutApi();
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(false);

		expect(unregisterCalls).toEqual([]);
	});

	it('does not mark itself active when the OS registration fails', () => {
		const { api, unregisterCalls } = mockShortcutApi({ registerReturns: false });
		const controller = createHoverCopyController(() => {}, api);

		controller.setActive(true);

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
	});
});
