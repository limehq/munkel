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
 *
 * ## Confirmed-binding invariant (post-review hardening, Kimi-Review of 24d6340)
 *
 * `PaletteHotkeyResult#accelerator` reports ONLY an accelerator whose OS
 * registration is confirmed at return time (or `null` for "unbound") — never
 * a value we merely *intended* to bind. The original implementation reported
 * the old accelerator even when its rollback re-registration had failed too,
 * so `main.ts`/the renderer claimed a binding that did not exist and the app
 * was silently hotkey-less until restart. The double-failure path is now
 * modeled explicitly (`error: 'rollback-failed'`), with a one-shot
 * auto-heal: before reporting unbound, `DEFAULT_PALETTE_HOTKEY` is tried as
 * a fallback binding (unless it was itself one of the two combos that just
 * failed). A later successful rebind fully heals the unbound state — no
 * restart needed.
 */

import { DEFAULT_PALETTE_HOTKEY, isValidAccelerator } from '../shared/accelerator';

export { isValidAccelerator };

/** Minimal slice of Electron's `globalShortcut` module. */
export interface GlobalShortcutApi {
	register(accelerator: string, callback: () => void): boolean;
	unregister(accelerator: string): void;
}

export interface PaletteHotkeyResult {
	ok: boolean;
	/**
	 * The accelerator whose OS registration is CONFIRMED right now — `null`
	 * means the palette hotkey is currently unbound (double failure: the new
	 * combo failed AND neither the rollback nor the default fallback could
	 * be registered). Callers must mirror this exactly — `main.ts` tracks it
	 * as the current binding and the renderer displays it — so the UI can
	 * never claim a hotkey is bound while nothing actually is.
	 */
	accelerator: string | null;
	error?: 'invalid-accelerator' | 'registration-failed' | 'rollback-failed';
}

/**
 * Registers the palette hotkey at startup. Returns `false` (and logs) if
 * the OS registration failed — e.g. another app already owns the default
 * combo — mirroring `login-item.ts`'s never-fatal posture; the caller must
 * not let this abort app startup (and must track the binding as unbound,
 * not as the intended accelerator — see the confirmed-binding invariant).
 */
export function registerPaletteHotkey(api: GlobalShortcutApi, accelerator: string, callback: () => void): boolean {
	const ok = api.register(accelerator, callback);
	if (!ok) {
		console.warn(`[munkel] failed to register palette hotkey "${accelerator}"`);
	}
	return ok;
}

/**
 * Rebinds the palette hotkey from `currentAccelerator` (the currently
 * confirmed binding, or `null` if the hotkey is currently unbound) to
 * `nextAccelerator`.
 *
 * - Rejects an invalid or malformed accelerator (`error: 'invalid-accelerator'`)
 *   without touching the existing registration at all.
 * - A no-op rebind (`next === current`, e.g. "reset to default" when already
 *   at default) is reported as success without re-registering.
 * - Otherwise unregisters the old accelerator (if any) and tries to register
 *   the new one. On success, returns the new accelerator.
 * - On failure (OS rejected the new combo — already owned by another app),
 *   **rolls back**: the old accelerator is re-registered and reported with
 *   `error: 'registration-failed'`, so the caller persists nothing and the
 *   renderer snaps its display back.
 * - If the rollback registration ALSO fails (the old combo was grabbed by
 *   another app in the window between unregister and re-register), the
 *   result is `error: 'rollback-failed'` and `accelerator` reports only what
 *   could actually be bound: `DEFAULT_PALETTE_HOTKEY` if the one-shot
 *   auto-heal fallback succeeded, else `null` (unbound). Never the old
 *   accelerator — its registration is confirmed dead at that point.
 */
export function rebindPaletteHotkey(
	api: GlobalShortcutApi,
	currentAccelerator: string | null,
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

	if (currentAccelerator !== null) {
		api.unregister(currentAccelerator);
	}
	const ok = api.register(next, callback);
	if (ok) {
		return { ok: true, accelerator: next };
	}

	// Rollback: re-register the old accelerator so a failed rebind normally
	// leaves the previous binding intact.
	if (currentAccelerator !== null && api.register(currentAccelerator, callback)) {
		console.warn(`[munkel] failed to register palette hotkey "${next}" — kept "${currentAccelerator}"`);
		return { ok: false, accelerator: currentAccelerator, error: 'registration-failed' };
	}

	// Double failure: neither the new combo nor the old one could be bound.
	// One-shot auto-heal: fall back to the default combo, unless the default
	// IS one of the two accelerators that just failed to register.
	const rollbackDescription =
		currentAccelerator === null
			? 'there was no previous binding to roll back to'
			: `rollback to "${currentAccelerator}" failed too`;
	if (
		DEFAULT_PALETTE_HOTKEY !== next &&
		DEFAULT_PALETTE_HOTKEY !== currentAccelerator &&
		api.register(DEFAULT_PALETTE_HOTKEY, callback)
	) {
		console.error(
			`[munkel] palette hotkey rebind to "${next}" failed and ${rollbackDescription} — healed to default "${DEFAULT_PALETTE_HOTKEY}"`,
		);
		return { ok: false, accelerator: DEFAULT_PALETTE_HOTKEY, error: 'rollback-failed' };
	}

	console.error(
		`[munkel] palette hotkey rebind to "${next}" failed and ${rollbackDescription} — hotkey is now unbound (a successful rebind will heal this)`,
	);
	return { ok: false, accelerator: null, error: 'rollback-failed' };
}
