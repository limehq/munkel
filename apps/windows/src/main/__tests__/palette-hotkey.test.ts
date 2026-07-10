import { describe, expect, it } from 'bun:test';
import {
	rebindPaletteHotkey,
	registerPaletteHotkey,
	type GlobalShortcutApi,
} from '../palette-hotkey';

function makeFakeApi(overrides?: { registerResult?: boolean | ((accelerator: string) => boolean) }) {
	const registered: string[] = [];
	const unregistered: string[] = [];
	const resolveRegister =
		typeof overrides?.registerResult === 'function'
			? overrides.registerResult
			: () => overrides?.registerResult ?? true;

	const api: GlobalShortcutApi = {
		register(accelerator: string, _callback: () => void) {
			const ok = resolveRegister(accelerator);
			if (ok) registered.push(accelerator);
			return ok;
		},
		unregister(accelerator: string) {
			unregistered.push(accelerator);
		},
	};

	return { api, registered, unregistered };
}

describe('registerPaletteHotkey (Plan 12 P3.1)', () => {
	it('registers the given accelerator and returns true on success', () => {
		const { api, registered } = makeFakeApi();
		const callback = () => {};
		expect(registerPaletteHotkey(api, 'Ctrl+Shift+M', callback)).toBe(true);
		expect(registered).toEqual(['Ctrl+Shift+M']);
	});

	it('returns false (and does not throw) when OS registration fails', () => {
		const { api } = makeFakeApi({ registerResult: false });
		expect(registerPaletteHotkey(api, 'Ctrl+Shift+M', () => {})).toBe(false);
	});
});

describe('rebindPaletteHotkey (Plan 12 P3.1)', () => {
	it('rejects an invalid accelerator without touching the current registration', () => {
		const { api, registered, unregistered } = makeFakeApi();
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'not a real accelerator', () => {});

		expect(result).toEqual({ ok: false, accelerator: 'Ctrl+Shift+M', error: 'invalid-accelerator' });
		expect(registered).toEqual([]);
		expect(unregistered).toEqual([]);
	});

	it('rejects a modifiers-only or bare-key accelerator as invalid', () => {
		const { api } = makeFakeApi();
		expect(rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Shift', () => {}).error).toBe('invalid-accelerator');
		expect(rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'M', () => {}).error).toBe('invalid-accelerator');
	});

	it('rejects non-string input as invalid', () => {
		const { api } = makeFakeApi();
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', undefined, () => {});
		expect(result.error).toBe('invalid-accelerator');
	});

	it('treats rebinding to the already-current accelerator as a no-op success', () => {
		const { api, registered, unregistered } = makeFakeApi();
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Shift+M', () => {});

		expect(result).toEqual({ ok: true, accelerator: 'Ctrl+Shift+M' });
		expect(registered).toEqual([]);
		expect(unregistered).toEqual([]);
	});

	it('unregisters the old accelerator and registers the new one on success', () => {
		const { api, registered, unregistered } = makeFakeApi();
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: true, accelerator: 'Ctrl+Alt+P' });
		expect(unregistered).toEqual(['Ctrl+Shift+M']);
		expect(registered).toEqual(['Ctrl+Alt+P']);
	});

	it('rolls back to the old accelerator when the new one fails to register', () => {
		const { api, registered, unregistered } = makeFakeApi({
			registerResult: (accelerator) => accelerator !== 'Ctrl+Alt+P',
		});
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: false, accelerator: 'Ctrl+Shift+M', error: 'registration-failed' });
		expect(unregistered).toEqual(['Ctrl+Shift+M']);
		// Rollback attempted the old accelerator; the failed new one was tried
		// too (both are "register" attempts even though only one succeeded).
		expect(registered).toEqual(['Ctrl+Shift+M']);
	});

	it('trims whitespace around the requested accelerator before validating/registering', () => {
		const { api, registered } = makeFakeApi();
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', '  Ctrl+Alt+P  ', () => {});

		expect(result).toEqual({ ok: true, accelerator: 'Ctrl+Alt+P' });
		expect(registered).toEqual(['Ctrl+Alt+P']);
	});
});

describe('rebindPaletteHotkey rollback double failure (confirmed-binding invariant)', () => {
	it('heals to the default combo when both the new combo and the rollback fail', () => {
		// New combo and old combo both unregistrable, but the default is free.
		const { api, registered } = makeFakeApi({
			registerResult: (accelerator) => accelerator === 'Ctrl+Shift+M',
		});
		const result = rebindPaletteHotkey(api, 'Ctrl+Alt+Q', 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: false, accelerator: 'Ctrl+Shift+M', error: 'rollback-failed' });
		expect(registered).toEqual(['Ctrl+Shift+M']);
	});

	it('reports accelerator: null (unbound) when new, rollback, AND default all fail — never the dead old combo', () => {
		const { api } = makeFakeApi({ registerResult: () => false });
		const result = rebindPaletteHotkey(api, 'Ctrl+Alt+Q', 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: false, accelerator: null, error: 'rollback-failed' });
	});

	it('does not retry the default as fallback when the failed old combo IS the default', () => {
		const registerAttempts: string[] = [];
		const api: GlobalShortcutApi = {
			register(accelerator: string) {
				registerAttempts.push(accelerator);
				return false;
			},
			unregister() {},
		};
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: false, accelerator: null, error: 'rollback-failed' });
		// new attempt + rollback attempt — NO third attempt re-trying the
		// default, which is the very combo whose rollback just failed.
		expect(registerAttempts).toEqual(['Ctrl+Alt+P', 'Ctrl+Shift+M']);
	});

	it('does not throw on the double-failure path', () => {
		const { api } = makeFakeApi({ registerResult: () => false });
		expect(() => rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Alt+P', () => {})).not.toThrow();
	});

	it('rebinding from an unbound state (current = null) skips unregister and succeeds', () => {
		const { api, registered, unregistered } = makeFakeApi();
		const result = rebindPaletteHotkey(api, null, 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: true, accelerator: 'Ctrl+Alt+P' });
		expect(unregistered).toEqual([]);
		expect(registered).toEqual(['Ctrl+Alt+P']);
	});

	it('a failed rebind from an unbound state has no rollback target and heals to the default when free', () => {
		const { api, registered } = makeFakeApi({
			registerResult: (accelerator) => accelerator === 'Ctrl+Shift+M',
		});
		const result = rebindPaletteHotkey(api, null, 'Ctrl+Alt+P', () => {});

		expect(result).toEqual({ ok: false, accelerator: 'Ctrl+Shift+M', error: 'rollback-failed' });
		expect(registered).toEqual(['Ctrl+Shift+M']);
	});

	it('a retry after an unbound double failure heals the state without a restart', () => {
		// First call: everything fails → unbound.
		let allowRegistration = false;
		const api: GlobalShortcutApi = {
			register(accelerator: string) {
				void accelerator;
				return allowRegistration;
			},
			unregister() {},
		};
		const first = rebindPaletteHotkey(api, 'Ctrl+Alt+Q', 'Ctrl+Alt+P', () => {});
		expect(first.accelerator).toBeNull();

		// Retry from the unbound state (caller now tracks null) with the OS
		// cooperating again — the same API instance, no restart in between.
		allowRegistration = true;
		const second = rebindPaletteHotkey(api, first.accelerator, 'Ctrl+Alt+R', () => {});
		expect(second).toEqual({ ok: true, accelerator: 'Ctrl+Alt+R' });
	});
});
