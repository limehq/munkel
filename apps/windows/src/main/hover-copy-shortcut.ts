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
 * attempt while `canArm()` is false is rejected instead of re-registering.
 * This only gates the *inactive → arm* transition — an already-armed
 * controller's periodic pings (which merely extend the idle deadline) are
 * not re-checked against `canArm`, since by construction the controller can
 * only be active while a prior arm attempt already passed the gate.
 *
 * `canArm` alone does not cover the mouseleave-during-`full`-phase case
 * (window still visible AND interactive when the stale ping lands), so an
 * explicit `setActive(false)` additionally starts a short re-arm cooldown —
 * see `HOVER_COPY_REARM_COOLDOWN_MS`.
 *
 * **Return-value semantics:** both gate rejections resolve `true` (feature
 * available, just not armed right now). `setActive(true)` returns `false`
 * ONLY when the OS shortcut registration itself failed — that is the one
 * case where the renderer is supposed to latch the feature off for the
 * session. Returning `false` for a merely-transient timing rejection would
 * permanently kill the feature on the renderer side.
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
	 * - Returns `false` ONLY when arming was requested and the OS
	 *   registration failed (e.g. another app owns the accelerator), so the
	 *   renderer can latch the feature off visibly instead of assuming it is
	 *   armed. Transient rejections — `canArm()` gate, post-disarm re-arm
	 *   cooldown — return `true` while leaving `isActive` false, because they
	 *   must NOT trigger the renderer's session-wide feature-off latch.
	 *   Disarming always succeeds and returns `true`.
	 */
	setActive(active: boolean): boolean;
	readonly isActive: boolean;
	/** Unconditional disarm + idle-timer cleanup (quit path). */
	dispose(): void;
}

/**
 * After an explicit external disarm (`setActive(false)` — mouseleave, hide,
 * click-through transition, renderer teardown), reject fresh arm attempts
 * for this long. Closes the remaining leg of the Late-Ping-Race that
 * `canArm` alone cannot: the renderer only sends pings while it believes
 * the notch is hovered (there is no timer that could fire post-leave — the
 * pings are synchronous mousemove handlers), but a ping that was already
 * *in flight on the IPC channel* when the mouseleave-driven disarm was
 * processed arrives moments later and, in the `full`-phase case, still
 * passes `canArm` (window visible + interactive). The cooldown makes that
 * stale ping a no-op; a genuine re-hover re-arms via the next throttled
 * mousemove ping (≤1 s later) once the window has passed. An *idle-timer*
 * disarm deliberately does NOT start the cooldown — a ping after idle
 * disarm is genuine current activity and should re-arm immediately.
 */
export const HOVER_COPY_REARM_COOLDOWN_MS = 300;

export function createHoverCopyController(
	onTrigger: () => void,
	api: GlobalShortcutApi,
	options: {
		idleMs?: number;
		canArm?: () => boolean;
		rearmCooldownMs?: number;
		/**
		 * Clock for the re-arm-cooldown deadline. MUST be monotonic —
		 * `Date.now()` would let an NTP backward step extend the cooldown
		 * by the size of the jump (worst case: shortcut un-armable for
		 * minutes/hours until the wall clock catches back up). Defaults to
		 * `performance.now()`, which is monotonic by spec; injectable for
		 * deterministic tests. (The idle deadline needs no clock — it lives
		 * in a `setTimeout`, which counts *elapsed* time and is likewise
		 * unaffected by wall-clock jumps.)
		 */
		now?: () => number;
	} = {},
): HoverCopyController {
	const idleMs = options.idleMs ?? HOVER_COPY_IDLE_MS;
	const rearmCooldownMs = options.rearmCooldownMs ?? HOVER_COPY_REARM_COOLDOWN_MS;
	const now = options.now ?? (() => performance.now());
	// Gate for the inactive → arm transition only (see "Late-Ping-Race fix"
	// in the module header). Defaults to always-armable so existing callers
	// (and every pre-existing test in this file) keep their current
	// behavior unchanged.
	const canArm = options.canArm ?? (() => true);
	let active = false;
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	// Monotonic-clock deadline before which fresh arms are rejected (see
	// HOVER_COPY_REARM_COOLDOWN_MS). null = no cooldown pending — an
	// explicit sentinel rather than 0, since an injected clock may
	// legitimately start at or near 0.
	let rearmBlockedUntil: number | null = null;

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
				// External disarm: start the re-arm cooldown so an IPC ping
				// already in flight behind this call cannot instantly re-arm.
				// (The internal idle-timer disarm calls `disarm()` directly
				// and intentionally does not set this.)
				rearmBlockedUntil = now() + rearmCooldownMs;
				disarm();
				return true;
			}
			if (active) {
				// Already armed: treat as an activity ping and extend the
				// idle deadline.
				restartIdleTimer();
				return true;
			}
			if (!canArm() || (rearmBlockedUntil !== null && now() < rearmBlockedUntil)) {
				// Transient rejection — either a late/stale ping while the
				// notch is no longer visible+interactive (`canArm` gate, review
				// MAJOR Late-Ping-Race), or an in-flight ping landing inside
				// the post-disarm cooldown window. Return `true`, NOT `false`:
				// `false` means "OS registration failed" and makes the renderer
				// latch the feature off for the whole session, which must never
				// happen for a rejection that is merely about *timing*. The
				// controller stays disarmed (`isActive` false); a genuine
				// re-hover re-arms via the next throttled mousemove ping.
				return true;
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
			rearmBlockedUntil = null;
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
