import { describe, expect, it } from 'bun:test';
import {
	MENU_TOGGLE_GUARD_MS,
	isDismissSuppressed,
	isGitHubLoginActive,
	shouldReopenMenu,
} from '../menu-dismiss';

describe('isGitHubLoginActive', () => {
	it('is active while a login flow is in flight', () => {
		expect(isGitHubLoginActive('requesting')).toBe(true);
		expect(isGitHubLoginActive('awaiting')).toBe(true);
		expect(isGitHubLoginActive('fetching')).toBe(true);
	});

	it('is inactive when idle or terminal', () => {
		expect(isGitHubLoginActive('idle')).toBe(false);
		expect(isGitHubLoginActive('failed')).toBe(false);
	});
});

describe('isDismissSuppressed', () => {
	const base = { pickerOpen: false, githubLoginActive: false, devToolsOpen: false, isDev: false };

	it('does not suppress by default', () => {
		expect(isDismissSuppressed(base)).toBe(false);
	});

	it('suppresses while the native picker is open', () => {
		expect(isDismissSuppressed({ ...base, pickerOpen: true })).toBe(true);
	});

	it('suppresses while a GitHub login is active', () => {
		expect(isDismissSuppressed({ ...base, githubLoginActive: true })).toBe(true);
	});

	it('suppresses for DevTools only in development', () => {
		expect(isDismissSuppressed({ ...base, devToolsOpen: true, isDev: true })).toBe(true);
		expect(isDismissSuppressed({ ...base, devToolsOpen: true, isDev: false })).toBe(false);
	});
});

describe('shouldReopenMenu', () => {
	it('never reopens when the menu is already visible', () => {
		expect(
			shouldReopenMenu({ visible: true, lastHideWasBlur: false, hiddenByBlurAt: 0, now: 1_000 }),
		).toBe(false);
	});

	it('reopens when hidden and not inside the blur guard', () => {
		expect(
			shouldReopenMenu({ visible: false, lastHideWasBlur: false, hiddenByBlurAt: 0, now: 1_000 }),
		).toBe(true);
	});

	it('does not reopen inside the guard after a blur-hide (tray-toggle race)', () => {
		const hiddenByBlurAt = 1_000;
		expect(
			shouldReopenMenu({
				visible: false,
				lastHideWasBlur: true,
				hiddenByBlurAt,
				now: hiddenByBlurAt + MENU_TOGGLE_GUARD_MS - 1,
			}),
		).toBe(false);
	});

	it('reopens again once the guard window has expired', () => {
		const hiddenByBlurAt = 1_000;
		expect(
			shouldReopenMenu({
				visible: false,
				lastHideWasBlur: true,
				hiddenByBlurAt,
				now: hiddenByBlurAt + MENU_TOGGLE_GUARD_MS,
			}),
		).toBe(true);
	});

	it('reopens inside the window when the last hide was not a blur (explicit hide)', () => {
		expect(
			shouldReopenMenu({ visible: false, lastHideWasBlur: false, hiddenByBlurAt: 1_000, now: 1_050 }),
		).toBe(true);
	});
});
