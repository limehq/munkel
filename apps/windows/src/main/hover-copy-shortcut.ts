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
 *
 * ## Late-Ping-Race fix (Iteration-5 re-review follow-up, 2026-07-10)
 *
 * The disarm paths above already force `active = false` in the controller
 * without waiting for the renderer. But `setActive(true)` used to always
 * treat a *currently-inactive* controller as "arm it" — so a renderer
 * activity ping that was already in flight when e.g.
 * `handleNotchSetInteractive(controller, false)` disarmed the shortcut
 * would land moments later and silently re-register "C" system-wide, even
 * though the notch is no longer visible+interactive. The caller now injects
 * `canArm` (`main.ts` wires it to `notchWindow.isVisible() &&` the
 * `interactive` flag tracked from `notch-set-interactive`); a fresh arm
 * attempt while `canArm()` is false is rejected (`setActive` returns
 * `false`) instead of re-registering. This only gates the *inactive → arm*
 * transition — an already-armed controller's periodic pings (which merely
 * extend the idle deadline) are not re-checked against `canArm`, since by
 * construction the controller can only be active while a prior arm attempt
 * already passed the gate.
 */

/** Minimal slice of Electron's `globalShortcut` module. */
export interface GlobalShortcutApi {
	register(accelerator: string, callback: () => void): boolean;
	unregister(accelerator: string): void;
}

/**
 * Disarm the shortcut after this long without an activity ping from the
 * renderer. The renderer throttles its mousemove pings to ~1s.
 *
 * ## Idle-timeout tradeoff (Iteration-5 re-review follow-up, 2026-07-10)
 *
 * The original 4s value bounded how long a resting pointer can keep "C"
 * captured system-wide, but it also broke the ordinary "hover quietly and
 * read, then press C" flow: a pointer that isn't *moving* (just resting
 * over the notch while the user reads) stopped pinging and the shortcut
 * went dead after 4s even though the user was still legitimately hovering.
 * That's a worse regression than a slightly longer worst-case system-wide
 * capture window, so this was raised to 15s and the actual "C" trigger now
 * also resets the idle deadline (see `createHoverCopyController`'s
 * `onTrigger` wrapping below) — a successful copy is itself strong evidence
 * of genuine, current activity, not a stale ping. 15s is still far below
 * "forgot about it" territory and the four main-owned disarm paths (hide,
 * render-process-gone, destroyed, non-interactive transition) still cover
 * the cases where the renderer can never send a final `false` at all.
 */
export const HOVER_COPY_IDLE_MS = 15_000;

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
	options: { idleMs?: number; canArm?: () => boolean } = {},
): HoverCopyController {
	const idleMs = options.idleMs ?? HOVER_COPY_IDLE_MS;
	// Gate for the inactive → arm transition only (see "Late-Ping-Race fix"
	// in the module header). Defaults to always-armable so existing callers
	// (and every pre-existing test in this file) keep their current
	// behavior unchanged.
	const canArm = options.canArm ?? (() => true);
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
			if (!canArm()) {
				// Late/stale ping: the notch is no longer visible+interactive
				// (per the injected `canArm` gate), so this is a re-arm attempt
				// for a shortcut that either was already disarmed or should
				// never have been armed in the first place. Reject instead of
				// silently re-capturing "C" system-wide (review MAJOR
				// Late-Ping-Race — see the module header).
				return false;
			}
			const ok = api.register('C', () => {
				// A successful trigger is itself proof of current, genuine
				// activity — reset the idle deadline the same as an explicit
				// ping (Iteration-5 idle-UX follow-up).
				restartIdleTimer();
				onTrigger();
			});
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
	off(event: 'hide', listener: () => void): unknown;
	webContents: {
		on(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown;
		off(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown;
	};
}

/** Windows already wired via `wireHoverCopyDisarm`, guarding against a
 * caller wiring the same window twice (which would double-register the
 * listeners and disarm-then-immediately-noop twice per event). Cleared by
 * the returned dispose handle. */
const wiredWindows = new WeakSet<HoverCopyWindowLike>();

/**
 * Main-owned disarm paths that must not depend on the renderer sending a
 * final `setActive(false)` (review CRITICALs 1 + 2):
 *
 * - `hide`: `requestNotchHide` hides the window without any mouseleave
 *   ever reaching the renderer.
 * - `render-process-gone` / `destroyed`: a crashed or torn-down renderer
 *   can never send the disarm IPC — without this, "C" would stay dead
 *   system-wide until app quit.
 *
 * Returns a dispose handle that removes the listeners it registered (MINOR
 * follow-up, Iteration-5 re-review): callers that need to re-wire a window
 * (e.g. in tests, or a future notch-window recreate path) can now tear down
 * cleanly instead of leaking listeners. Calling `wireHoverCopyDisarm` twice
 * for the same window is a no-op on the second call (logged) rather than
 * silently double-registering.
 */
export function wireHoverCopyDisarm(controller: HoverCopyController, win: HoverCopyWindowLike): () => void {
	if (wiredWindows.has(win)) {
		console.warn('[munkel] wireHoverCopyDisarm called twice for the same window — ignoring duplicate wire');
		return () => {};
	}
	wiredWindows.add(win);
	const disarm = () => controller.setActive(false);
	win.on('hide', disarm);
	win.webContents.on('render-process-gone', disarm);
	win.webContents.on('destroyed', disarm);
	return () => {
		wiredWindows.delete(win);
		win.off('hide', disarm);
		win.webContents.off('render-process-gone', disarm);
		win.webContents.off('destroyed', disarm);
	};
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
