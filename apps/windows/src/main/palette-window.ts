import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowUrl } from './window-url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PALETTE_WIDTH = 640;
const PALETTE_HEIGHT = 440;

export function createPaletteWindow(): BrowserWindow {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: PALETTE_WIDTH,
		height: PALETTE_HEIGHT,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: '#00000000',
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: false,
		hasShadow: true,
		thickFrame: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const x = Math.round((width - PALETTE_WIDTH) / 2);
	const y = Math.round((height - PALETTE_HEIGHT) / 2);
	win.setPosition(x, y);

	win.loadURL(getWindowUrl('/palette'));
	return win;
}

export function showPalette(win: BrowserWindow | null): void {
	if (!win) return;
	win.show();
	win.focus();
	win.webContents.send('palette-show');
}

export function hidePalette(win: BrowserWindow | null): void {
	if (!win) return;
	win.webContents.send('palette-hide');
	setTimeout(() => win.hide(), 150);
}
