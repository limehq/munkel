/**
 * Windows counterpart to macOS `CaptureExclusion.swift` / `NSWindow.sharingType`.
 * Electron's `BrowserWindow.setContentProtection(true)` is the equivalent
 * mechanism: it excludes the window from the legacy GDI/DWM capture path and
 * from most modern screen-capture APIs (Snipping Tool, OBS, Teams/Zoom
 * screen share). Every window that can show message content or circle codes
 * (menu, notch, palette) sets this at creation time.
 *
 * Windows has no equivalent of macOS's `.readOnly` sharing type (visible in
 * screenshots but not live recordings) — `setContentProtection` is strictly
 * on/off. So unlike macOS's DEBUG-only "Allow in screenshots" toggle, which
 * only ever affects screenshot-style capture, flipping this off on Windows
 * also makes the surfaces visible in live screen shares/recordings. That
 * trade-off is intentional and documented at the call site (Plan 13 item 5).
 */

/** Minimal slice of Electron's `BrowserWindow` this module depends on, so tests can pass a plain mock. */
export interface ContentProtectionWindow {
	isDestroyed(): boolean;
	setContentProtection(enable: boolean): void;
}

/**
 * Applies (or lifts) capture protection across every window in `windows`.
 * `allowInScreenshots: true` means "visible to screen capture", i.e.
 * `setContentProtection(false)` — the naming mirrors the user-facing
 * settings-popover checkbox label, not the underlying Electron API's sense.
 *
 * Skips `null` entries (a window that hasn't been created yet) and already
 * -destroyed windows (calling `setContentProtection` on one throws). Never
 * throws itself — a single window's failure is logged and does not prevent
 * applying the setting to the others.
 */
export function applyContentProtection(
	windows: ReadonlyArray<ContentProtectionWindow | null | undefined>,
	allowInScreenshots: boolean,
): void {
	const protect = !allowInScreenshots;
	for (const win of windows) {
		if (!win || win.isDestroyed()) continue;
		try {
			win.setContentProtection(protect);
		} catch (err) {
			console.error('[munkel] setContentProtection failed:', err);
		}
	}
}
