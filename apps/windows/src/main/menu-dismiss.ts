import type { GitHubLoginPhase } from '../shared/types';

// Guard window for the tray blur→click race: if the menu was hidden by its own
// blur handler within this many ms, a tray/IPC toggle is treated as the same
// user gesture and does not reopen it. See Plan 06 for the trade-off.
export const MENU_TOGGLE_GUARD_MS = 200;

/**
 * GitHub login is "active" (the user may switch to the browser to enter the
 * device code) during these phases. The menu must not auto-hide then, or the
 * login-code UI — pushed only to the menu window — disappears mid-flow.
 */
export function isGitHubLoginActive(phase: GitHubLoginPhase): boolean {
	return phase === 'requesting' || phase === 'awaiting' || phase === 'fetching';
}

export interface DismissSuppressionInput {
	pickerOpen: boolean;
	githubLoginActive: boolean;
	devToolsOpen: boolean;
	isDev: boolean;
}

/**
 * True while the menu window must NOT auto-hide on blur: a native picker
 * (recipient `<select>`) is open, a GitHub login is in flight, or DevTools are
 * open in development.
 */
export function isDismissSuppressed({
	pickerOpen,
	githubLoginActive,
	devToolsOpen,
	isDev,
}: DismissSuppressionInput): boolean {
	return pickerOpen || githubLoginActive || (isDev && devToolsOpen);
}

export interface MenuReopenInput {
	visible: boolean;
	lastHideWasBlur: boolean;
	hiddenByBlurAt: number;
	now: number;
	guardMs?: number;
}

/**
 * Whether a tray/IPC toggle should reopen the menu. Guards the blur→click race:
 * when the menu was just hidden by our own blur handler within the guard window,
 * the toggle is the same gesture (e.g. a tray click that first blurred the menu)
 * and must not reopen it.
 */
export function shouldReopenMenu({
	visible,
	lastHideWasBlur,
	hiddenByBlurAt,
	now,
	guardMs = MENU_TOGGLE_GUARD_MS,
}: MenuReopenInput): boolean {
	if (visible) return false;
	const insideGuard = lastHideWasBlur && now - hiddenByBlurAt < guardMs;
	console.log('[guard] shouldReopenMenu: visible=', visible, 'lastHideWasBlur=', lastHideWasBlur, 'delta=', now - hiddenByBlurAt, 'insideGuard=', insideGuard);
	return !insideGuard;
}
