import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowUrl } from './window-url';
import { unfocusNotchAfterReply } from './notch-focus';
import type { NotchMessage } from '../shared/types';
import { PUSH_CHANNELS } from '../shared/ipc-channels';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NOTCH_WIDTH = 360;
const NOTCH_HEIGHT = 260;
const NOTCH_HIDE_DELAY_MS = 250;

let pendingHide: ReturnType<typeof setTimeout> | null = null;

function clearPendingHide(): void {
	if (!pendingHide) return;
	clearTimeout(pendingHide);
	pendingHide = null;
}

export function createNotchWindow(): BrowserWindow {
	const { width } = screen.getPrimaryDisplay().workAreaSize;

	const win = new BrowserWindow({
		width: NOTCH_WIDTH,
		height: NOTCH_HEIGHT,
		show: false,
		frame: false,
		transparent: true,
		backgroundColor: '#00000000',
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: false,
		focusable: false,
		hasShadow: true,
		thickFrame: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.setContentProtection(true);

	const x = Math.round((width - NOTCH_WIDTH) / 2);
	win.setPosition(x, 0);

	win.loadURL(getWindowUrl('/notch'));
	win.on('ready-to-show', () => {
		win.setPosition(x, 0);
	});
	return win;
}

export function showNotch(win: BrowserWindow | null): void {
	if (!win) return;
	clearPendingHide();
	win.showInactive();
	win.webContents.send(PUSH_CHANNELS.NOTCH_SHOW);
}

export function hideNotch(win: BrowserWindow | null): void {
	requestNotchHide(win);
}

export function requestNotchHide(win: BrowserWindow | null): void {
	if (!win) return;
	unfocusNotchAfterReply(win);
	win.webContents.send(PUSH_CHANNELS.NOTCH_HIDE);
	// Give the renderer time to animate out before hiding the window.
	clearPendingHide();
	pendingHide = setTimeout(() => {
		pendingHide = null;
		win.hide();
	}, NOTCH_HIDE_DELAY_MS);
}

export function updateNotch(win: BrowserWindow | null, data: NotchMessage): void {
	if (!win) return;
	win.webContents.send(PUSH_CHANNELS.NOTCH_UPDATE, data);
}
