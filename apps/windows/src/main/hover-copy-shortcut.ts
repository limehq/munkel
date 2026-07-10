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
 * uses via `KeyboardShortcuts.enable/disable`.
 *
 * ## Lifecycle ownership (post-review hardening, 2026-07-10)
 *
 * A system-wide "C" capture that stays armed too long makes the "C" key
 * dead for every other app, so the MAIN process — not the renderer — owns
 * the disarm lifecycle. The renderer is only a *hint provider*: it reports
 * hover + reply-open state (and periodic mouse-movement activity pings)
 * over the `notch-set-hover-copy` IPC channel, and the main process
 * guarantees disarm on every path where those hints can go stale:
 *
 * - **Idle timeout** (`HOVER_COPY_IDLE_MS`): every arm/activity ping
 *   restarts a timer; if the renderer stops reporting movement (pointer
 *   resting on the notch while the user types in another app, renderer
 *   wedged, missed mouseleave), the shortcut disarms itself.
 * - **Window hide / non-interactive transition / renderer crash / quit**:
 *   wired in `main.ts` via `wireHoverCopyDisarm` and
 *   `handleNotchSetInteractive` below — none of these paths depend on the
 *   renderer sending a final `false`.
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

/**
 * Disarm the shortcut after this long without an activity ping from the
 * renderer. The renderer throttles its mousemove pings to ~1s, so 4s
 * tolerates several dropped pings while still bounding how long a resting
 * pointer can keep "C" captured system-wide (a pointer parked on the notch
 * while the user types "c" in another app was review CRITICAL 3).
 */
export const HOVER_COPY_IDLE_MS = 4_000;

export interface HoverCopyController {
	/**
	 * Arm (`true`) or disarm (`false`) the bare-"C" global shortcut.
	 *
	 * - `setActive(true)` while already armed is an **activity ping**: it
	 *   restarts the idle timer instead of re-registering.
	 * - Returns `false` only when arming was requested and the OS
	 *   registration failed (e.g. another app owns the accelerator), so the
	 *   renderer can turn the feature off visibly instead of assuming it is
	 *   armed. Disarming always succeeds and returns `true`.
	 */
	setActive(active: boolean): boolean;
	readonly isActive: boolean;
	/** Unconditional disarm + idle-timer cleanup (quit path). */
	dispose(): void;
}

export function createHoverCopyController(
	onTrigger: () => void,
	api: GlobalShortcutApi,
	options: { idleMs?: number } = {},
): HoverCopyController {
	const idleMs = options.idleMs ?? HOVER_COPY_IDLE_MS;
	let active = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;

	function clearIdleTimer(): void {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
			idleTimer = null;
		}
	}

	function disarm(): void {
		clearIdleTimer();
		if (!active) return;
		api.unregister('C');
		active = false;
	}

	function restartIdleTimer(): void {
		clearIdleTimer();
		idleTimer = setTimeout(disarm, idleMs);
	}

	return {
		get isActive() {
			return active;
		},
		setActive(next: boolean): boolean {
			if (!next) {
				disarm();
				return true;
			}
			if (active) {
				// Already armed: treat as an activity ping and extend the
				// idle deadline.
				restartIdleTimer();
				return true;
			}
			const ok = api.register('C', onTrigger);
			if (!ok) {
				console.warn('[munkel] failed to register hover-copy "C" global shortcut — feature disabled');
				return false;
			}
			active = true;
			restartIdleTimer();
			return true;
		},
		dispose(): void {
			disarm();
		},
	};
}

/**
 * Minimal structural slice of `BrowserWindow` needed to observe the events
 * after which the hover-copy shortcut must never stay armed.
 */
export interface HoverCopyWindowLike {
	on(event: 'hide', listener: () => void): unknown;
	webContents: {
		on(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown;
	};
}

/**
 * Main-owned disarm paths that must not depend on the renderer sending a
 * final `setActive(false)` (review CRITICALs 1 + 2):
 *
 * - `hide`: `requestNotchHide` hides the window without any mouseleave
 *   ever reaching the renderer.
 * - `render-process-gone` / `destroyed`: a crashed or torn-down renderer
 *   can never send the disarm IPC — without this, "C" would stay dead
 *   system-wide until app quit.
 */
export function wireHoverCopyDisarm(controller: HoverCopyController, win: HoverCopyWindowLike): void {
	const disarm = () => controller.setActive(false);
	win.on('hide', disarm);
	win.webContents.on('render-process-gone', disarm);
	win.webContents.on('destroyed', disarm);
}

/**
 * Hook for the `notch-set-interactive` IPC handler: switching the notch to
 * click-through (`setIgnoreMouseEvents(true)`) means the renderer may never
 * receive a mouseleave for the pointer that armed the shortcut, so the
 * non-interactive transition force-disarms in the main process.
 */
export function handleNotchSetInteractive(controller: HoverCopyController | null, interactive: boolean): void {
	if (!interactive) controller?.setActive(false);
}
