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
	win.setAlwaysOnTop(true, 'pop-up-menu');

	// Position near the tray icon on the display where the cursor currently is,
	// respecting that display's work area (taskbar position, multi-monitor).
	const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
	const { width: workWidth, height: workHeight, x: workX, y: workY } = display.workArea;

	const margin = 16;
	const winWidth = 320;
	const winHeight = 520;
	const x = Math.max(workX, workX + workWidth - winWidth - margin);
	const y = Math.max(workY, workY + workHeight - winHeight - margin);
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
	if (!win) {
		console.log('[menu] toggleMenuWindow: win is null');
		return;
	}

	const visible = win.isVisible();
	console.log('[menu] toggleMenuWindow: visible=', visible, 'lastHideWasBlur=', lastHideWasBlur);

	if (visible) {
		win.hide();
		return;
	}

	const shouldShow = shouldReopenMenu({
		visible: false,
		lastHideWasBlur,
		hiddenByBlurAt: menuHiddenByBlurAt,
		now: Date.now(),
	});

	console.log('[menu] toggleMenuWindow: shouldShow=', shouldShow);

	if (shouldShow) {
		showMenuWindow(win);
	} else {
		// This toggle is the same gesture as a just-happened blur-hide (e.g. a
		// tray click that blurred the menu first). Consume the guard so the next
		// toggle reopens normally.
		console.log('[menu] toggleMenuWindow: guard consumed, resetting lastHideWasBlur');
		lastHideWasBlur = false;
	}
}

export function showMenuWindow(win: BrowserWindow | null): void {
	if (!win) return;
	console.log('[menu] showMenuWindow: showing and focusing');
	lastHideWasBlur = false;
	if (win.isMinimized()) {
		win.restore();
	}
	// Plan 06: show() + focus() is more reliable on Windows than showInactive()
	// + moveTop() for tray-activated popups.
	win.show();
	win.focus();
}

export function hideMenuWindow(win: BrowserWindow | null): void {
	win?.hide();
}
