/**
 * Rebindable palette-toggle global hotkey (Plan 12 P3.1), replacing the
 * hardcoded `Ctrl+Shift+M` in the old `shortcuts.ts#registerTogglePalette`.
 * Persisted in `IdentityStore#paletteHotkey` (default
 * `DEFAULT_PALETTE_HOTKEY`), read at startup, and rebindable at runtime via
 * the settings-popover recorder in `MenuWindow.tsx`.
 *
 * Same dependency-injection posture as `hover-copy-shortcut.ts` and
 * `login-item.ts`: no `import ... from 'electron'` of its own, so this
 * module's tests never touch the (possibly differently-mocked-elsewhere)
 * `electron` package. `main.ts` injects the real `globalShortcut` module.
 */

import { isValidAccelerator } from '../shared/accelerator';

export { isValidAccelerator };

/** Minimal slice of Electron's `globalShortcut` module. */
export interface GlobalShortcutApi {
	register(accelerator: string, callback: () => void): boolean;
	unregister(accelerator: string): void;
}

export interface PaletteHotkeyResult {
	ok: boolean;
	/** The accelerator now actually bound — the new one on success, or the
	 * unchanged previous one on any failure (validation or OS registration),
	 * so the renderer can always snap its display back to what's really
	 * registered instead of assuming its own request took effect. */
	accelerator: string;
	error?: 'invalid-accelerator' | 'registration-failed';
}

/**
 * Registers the palette hotkey at startup. Returns `false` (and logs) if
 * the OS registration failed — e.g. another app already owns the default
 * combo — mirroring `login-item.ts`'s never-fatal posture; the caller must
 * not let this abort app startup.
 */
export function registerPaletteHotkey(api: GlobalShortcutApi, accelerator: string, callback: () => void): boolean {
	const ok = api.register(accelerator, callback);
	if (!ok) {
		console.warn(`[munkel] failed to register palette hotkey "${accelerator}"`);
	}
	return ok;
}

/**
 * Rebinds the palette hotkey from `currentAccelerator` to `nextAccelerator`.
 *
 * - Rejects an invalid or malformed accelerator (`error: 'invalid-accelerator'`)
 *   without touching the existing registration at all.
 * - A no-op rebind (`next === current`, e.g. "reset to default" when already
 *   at default) is reported as success without re-registering.
 * - Otherwise unregisters the old accelerator and tries to register the new
 *   one. On success, returns the new accelerator. On failure (OS rejected
 *   the new combo — already owned by another app), **rolls back**: the old
 *   accelerator is re-registered so the palette hotkey is never left
 *   unbound, and the result reports the old accelerator with
 *   `error: 'registration-failed'` so the caller persists nothing and the
 *   renderer snaps its display back.
 */
export function rebindPaletteHotkey(
	api: GlobalShortcutApi,
	currentAccelerator: string,
	nextAccelerator: unknown,
	callback: () => void,
): PaletteHotkeyResult {
	if (!isValidAccelerator(nextAccelerator)) {
		return { ok: false, accelerator: currentAccelerator, error: 'invalid-accelerator' };
	}
	const next = nextAccelerator.trim();

	if (next === currentAccelerator) {
		return { ok: true, accelerator: currentAccelerator };
	}

	api.unregister(currentAccelerator);
	const ok = api.register(next, callback);
	if (ok) {
		return { ok: true, accelerator: next };
	}

	// Rollback: re-register the old accelerator so a failed rebind never
	// leaves the palette hotkey completely unbound.
	const rollbackOk = api.register(currentAccelerator, callback);
	if (!rollbackOk) {
		console.error(
			`[munkel] palette hotkey rollback to "${currentAccelerator}" failed after rebind to "${next}" failed — hotkey is now unbound`,
		);
	}
	console.warn(`[munkel] failed to register palette hotkey "${next}" — kept "${currentAccelerator}"`);
	return { ok: false, accelerator: currentAccelerator, error: 'registration-failed' };
}
