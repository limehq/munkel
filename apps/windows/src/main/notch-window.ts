import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindowUrl } from './window-url';
import { unfocusNotchAfterReply } from './notch-focus';
import type { NotchMessage } from '../shared/types';
import { PUSH_CHANNELS } from '../shared/ipc-channels';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Compact dimensions close to the macOS reference: the macOS notch content
 * is 250 pt wide (`MessageNotchContainer.swift` `tickerWindow = 250`) and
 * only ever grows downward. 280 px matches the 280 px-wide CSS widget
 * (`.notch-widget`) while staying far below the old 360 px. Height starts
 * compact and is resized to the rendered content via the `notch-resize`
 * IPC (see `resizeNotchToContent`).
 */
export const NOTCH_WIDTH = 280;
export const NOTCH_DEFAULT_HEIGHT = 180;
export const NOTCH_MIN_HEIGHT = 40;
export const NOTCH_MAX_HEIGHT = 480;
const NOTCH_HIDE_DELAY_MS = 250;

/** Clamp a renderer-reported content height to sane window bounds. */
export function clampNotchHeight(contentHeight: number): number {
	if (!Number.isFinite(contentHeight) || contentHeight <= 0) return NOTCH_DEFAULT_HEIGHT;
	return Math.min(NOTCH_MAX_HEIGHT, Math.max(NOTCH_MIN_HEIGHT, Math.ceil(contentHeight)));
}

/**
 * Resize the notch window vertically to fit its rendered content. Width and
 * position stay fixed (top-center anchor), so the window only ever grows
 * downward — matching macOS "hovering only grows downward" behavior.
 */
export function resizeNotchToContent(win: BrowserWindow | null, contentHeight: number): void {
	if (!win) return;
	const height = clampNotchHeight(contentHeight);
	const [currentWidth, currentHeight] = win.getSize();
	if (currentHeight === height) return;
	// The window is created non-resizable (blocks user resizing); lift that
	// briefly so the programmatic resize is honored on every platform.
	const wasResizable = win.isResizable();
	if (!wasResizable) win.setResizable(true);
	win.setSize(currentWidth, height);
	if (!wasResizable) win.setResizable(false);
}

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
		height: NOTCH_DEFAULT_HEIGHT,
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
