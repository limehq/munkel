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

	it('logs (but does not throw) when even the rollback registration fails', () => {
		const { api } = makeFakeApi({ registerResult: () => false });
		expect(() => rebindPaletteHotkey(api, 'Ctrl+Shift+M', 'Ctrl+Alt+P', () => {})).not.toThrow();
	});

	it('trims whitespace around the requested accelerator before validating/registering', () => {
		const { api, registered } = makeFakeApi();
		const result = rebindPaletteHotkey(api, 'Ctrl+Shift+M', '  Ctrl+Alt+P  ', () => {});

		expect(result).toEqual({ ok: true, accelerator: 'Ctrl+Alt+P' });
		expect(registered).toEqual(['Ctrl+Alt+P']);
	});
});
