/**
 * Hover-"C" copy shortcut (Plan 12 P3.2), mirroring macOS
 * `Shortcuts.copyHoveredHistory` / `NotchPresenter`'s
 * `KeyboardShortcuts.enable/disable(.copyHoveredHistory)`.
 *
 * The notch `BrowserWindow` is created `focusable: false` (see
 * `notch-window.ts`) and only ever gains OS focus while a reply is open
 * (`notch-focus.ts`), so a page-level `keydown` listener in the renderer
 * would never see a bare "C" press while merely hovering. Electron's
 * `globalShortcut` module is the only way to observe a system-wide key
 * while the window itself never takes focus — the same mechanism macOS
 * uses via `KeyboardShortcuts.enable/disable`. The renderer arms/disarms
 * this controller via the `notch-set-hover-copy` IPC channel whenever its
 * own hover + reply-open state changes, so the global "C" capture is only
 * ever live for the brief window the pointer is actually over the notch.
 *
 * This module deliberately has no `import ... from 'electron'` of its own
 * (unlike `shortcuts.ts`) so it — and its tests — never touch the real or
 * mocked `electron` package: the caller (`main.ts`) injects the
 * `globalShortcut` API, mirroring `login-item.ts`'s dependency-injection
 * posture for the same reason.
 */

/** Minimal slice of Electron's `globalShortcut` module. */
export interface GlobalShortcutApi {
	register(accelerator: string, callback: () => void): boolean;
	unregister(accelerator: string): void;
}

export interface HoverCopyController {
	/** Arm/disarm the bare-"C" global shortcut. Idempotent: repeated calls
	 * with the same value are no-ops. */
	setActive(active: boolean): void;
	readonly isActive: boolean;
}

export function createHoverCopyController(onTrigger: () => void, api: GlobalShortcutApi): HoverCopyController {
	let active = false;
	return {
		get isActive() {
			return active;
		},
		setActive(next: boolean): void {
			const value = !!next;
			if (value === active) return;
			if (value) {
				const ok = api.register('C', onTrigger);
				active = ok;
				if (!ok) {
					console.warn('[munkel] failed to register hover-copy "C" global shortcut');
				}
			} else {
				api.unregister('C');
				active = false;
			}
		},
	};
}
