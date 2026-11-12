/**
 * Windows counterpart to the macOS `LoginItem.swift` autostart helper, but
 * opt-in only (Plan 12 P2.1): unlike the macOS release, which auto-registers
 * once on first launch via `SMAppService.mainApp.register()`, Windows never
 * auto-registers — it only ever mirrors the user's persisted toggle choice
 * (`IdentityStore#launchAtLogin`, default `false`), applied once at startup
 * and again whenever the toggle changes.
 *
 * Dev-mode semantics: when `app.isPackaged` is false, the OS call is skipped
 * entirely — registering would autostart the bare `electron.exe` dev shell,
 * not Munkel (mirrors `LoginItem.swift`'s "RELEASE ONLY" guard, which skips
 * the differently-bundled "Munkel Dev" build). The skip is reported as
 * success so the user's *preference* still persists and the toggle does not
 * confusingly snap back in dev; the packaged build applies the persisted
 * choice at its next startup.
 *
 * Never fatal: `app.setLoginItemSettings` can throw under sandboxed/portable
 * installs, so every call site here is best-effort — a thrown failure must
 * not crash startup or the settings toggle, mirroring `LoginItem.swift`'s
 * `try?`-everywhere posture.
 */

/** Minimal slice of Electron's `App` this module depends on, so tests can pass a plain mock. */
export interface LoginItemApp {
	readonly isPackaged: boolean;
	setLoginItemSettings(settings: { openAtLogin: boolean }): void;
}

/** Minimal slice of `IdentityStore` needed to persist the preference. */
export interface LaunchAtLoginStore {
	patch(fields: { launchAtLogin: boolean }): void;
}

/**
 * Registers or unregisters the app as a Windows Startup item. Returns
 * `true` on success and `false` if Electron threw, so callers can decide
 * whether to surface a failure without ever letting it propagate.
 *
 * In unpackaged (dev) builds the OS call is skipped and `true` is returned
 * (see module docs for why the skip counts as success).
 */
export function applyLaunchAtLogin(app: LoginItemApp, enabled: boolean): boolean {
	if (!app.isPackaged) {
		console.log(
			`[munkel] dev build — skipping OS launch-at-login registration (openAtLogin=${enabled} preference persisted only)`,
		);
		return true;
	}
	try {
		app.setLoginItemSettings({ openAtLogin: enabled });
		return true;
	} catch (err) {
		console.error('[munkel] failed to set launch-at-login:', err);
		return false;
	}
}

/**
 * Full `set-launch-at-login` handler logic, extracted from `main.ts` so it is
 * unit-testable (the `main.ts` `app.whenReady()` wiring has no test harness).
 * Applies the OS setting and persists the choice only when the OS call
 * actually succeeded — like macOS's `try?` snap-back, a failed call must not
 * leave the stored preference out of sync with what the OS will really do on
 * next boot. Returns the success flag for the renderer's snap-back logic.
 */
export function setLaunchAtLoginPreference(
	app: LoginItemApp,
	store: LaunchAtLoginStore,
	enabled: unknown,
): boolean {
	const value = !!enabled;
	const ok = applyLaunchAtLogin(app, value);
	if (ok) store.patch({ launchAtLogin: value });
	return ok;
}
