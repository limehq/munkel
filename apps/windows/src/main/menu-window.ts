import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowUrl } from './window-url';
import { shouldReopenMenu } from './menu-dismiss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tray blur→click race guard state (see menu-dismiss.ts / Plan 06):
// `lastHideWasBlur` marks a hide caused by our own blur handler; `menuHiddenByBlurAt`
// timestamps it so the guard self-expires and can never wedge the toggle.
let menuHiddenByBlurAt = 0;
let lastHideWasBlur = false;

export function createMenuWindow(opts: { isDismissSuppressed?: () => boolean } = {}): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: 320,
		height: 520,
		show: false,
		frame: false,
		resizable: false,
		skipTaskbar: true,
		alwaysOnTop: true,
		transparent: true,
		backgroundColor: '#00000000',
		hasShadow: true,
		thickFrame: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.setContentProtection(true);

	const margin = 16;
	const x = Math.max(0, width - 320 - margin);
	const y = Math.max(0, height - 520 - margin);
	win.setPosition(x, y);

	win.loadURL(getWindowUrl('/menu'));

	// Click-away-to-dismiss: hide when focus leaves the menu, unless a dismissal
	// is suppressed (native picker open, GitHub login active, dev DevTools open).
	win.on('blur', () => {
		if (win.isDestroyed()) return; // blur can fire during teardown
		if (!win.isVisible()) return; // hide() re-emits blur; avoid recursion
		if (opts.isDismissSuppressed?.()) return;
		menuHiddenByBlurAt = Date.now();
		lastHideWasBlur = true;
		win.hide();
	});

	return win;
}

export function toggleMenuWindow(win: BrowserWindow | null): void {
	if (!win) return;
	if (win.isVisible()) {
		win.hide();
		return;
	}
	if (
		shouldReopenMenu({
			visible: false,
			lastHideWasBlur,
			hiddenByBlurAt: menuHiddenByBlurAt,
			now: Date.now(),
		})
	) {
		showMenuWindow(win);
	} else {
		// This toggle is the same gesture as a just-happened blur-hide (e.g. a
		// tray click that blurred the menu first). Consume the guard so the next
		// toggle reopens normally.
		lastHideWasBlur = false;
	}
}

export function showMenuWindow(win: BrowserWindow | null): void {
	if (!win) return;
	lastHideWasBlur = false;
	if (win.isMinimized()) {
		win.restore();
	}
	// Harden foreground activation on Windows: showInactive + moveTop keeps the
	// window on top of the shell, then focus() gives it keyboard focus.
	win.showInactive();
	win.moveTop();
	win.focus();
}

export function hideMenuWindow(win: BrowserWindow | null): void {
	win?.hide();
}
