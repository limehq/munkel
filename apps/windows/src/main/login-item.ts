/**
 * Windows counterpart to the macOS `LoginItem.swift` autostart helper, but
 * opt-in only (Plan 12 P2.1): unlike the macOS release, which auto-registers
 * once on first launch via `SMAppService.mainApp.register()`, Windows never
 * auto-registers — it only ever mirrors the user's persisted toggle choice
 * (`IdentityStore#launchAtLogin`, default `false`), applied once at startup
 * and again whenever the toggle changes.
 *
 * Never fatal: `app.setLoginItemSettings` can throw under sandboxed/portable
 * installs, so every call site here is best-effort — a thrown failure must
 * not crash startup or the settings toggle, mirroring `LoginItem.swift`'s
 * `try?`-everywhere posture.
 */

/** Minimal slice of Electron's `App` this module depends on, so tests can pass a plain mock. */
export interface LoginItemApp {
	setLoginItemSettings(settings: { openAtLogin: boolean }): void;
}

/**
 * Registers or unregisters the app as a Windows Startup item. Returns
 * `true` on success and `false` if Electron threw, so callers can decide
 * whether to surface a failure without ever letting it propagate.
 */
export function applyLaunchAtLogin(app: LoginItemApp, enabled: boolean): boolean {
	try {
		app.setLoginItemSettings({ openAtLogin: enabled });
		return true;
	} catch (err) {
		console.error('[munkel] failed to set launch-at-login:', err);
		return false;
	}
}
