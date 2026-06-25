import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowUrl } from './window-url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMenuWindow(): BrowserWindow {
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
	return win;
}

export function toggleMenuWindow(win: BrowserWindow | null): void {
	if (!win) return;
	if (win.isVisible()) {
		win.hide();
	} else {
		win.show();
		win.focus();
	}
}

export function hideMenuWindow(win: BrowserWindow | null): void {
	win?.hide();
}
