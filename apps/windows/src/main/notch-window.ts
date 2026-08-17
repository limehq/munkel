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
/**
 * Skip resizing when the requested height is within this many pixels of the
 * window's current height. Windows display scaling (125 %/150 %) can round
 * `setSize()` to a slightly different height than the renderer's
 * `offsetHeight`, which would otherwise retrigger the renderer's
 * ResizeObserver and cause an oscillating resize/IPC loop.
 */
const NOTCH_RESIZE_TOLERANCE_PX = 1;

/**
 * Compact bounds saved by `setNotchPreviewActive(win, true)` so it can be
 * restored exactly on `setNotchPreviewActive(win, false)`. Module-level
 * (like `pendingHide` below) since there is exactly one notch window.
 */
let compactBounds: Electron.Rectangle | null = null;
let previewActive = false;

/** True while the notch window is widened for the image Quick-Look overlay (Plan 14). */
export function isNotchPreviewActive(): boolean {
	return previewActive;
}

export function resizeNotchToContent(win: BrowserWindow | null, contentHeight: number): void {
	if (!win) return;
	// While the Quick-Look overlay has widened the window to the display's
	// full work area (see `setNotchPreviewActive` below), the renderer's
	// ResizeObserver still fires for `.notch-widget` (unaffected width/height)
	// — but the WINDOW itself must stay wide, not shrink back to compact
	// content height, until the preview closes and restores the saved bounds.
	if (previewActive) return;
	const height = clampNotchHeight(contentHeight);
	const [currentWidth, currentHeight] = win.getSize();
	if (Math.abs(currentHeight - height) <= NOTCH_RESIZE_TOLERANCE_PX) return;
	// The window is created non-resizable (blocks user resizing); lift that
	// briefly so the programmatic resize is honored on every platform.
	const wasResizable = win.isResizable();
	if (!wasResizable) win.setResizable(true);
	win.setSize(currentWidth, height);
	if (!wasResizable) win.setResizable(false);
}

/**
 * Widen the notch window to the display's full work area (Plan 14 / OQ4
 * Quick-Look overlay) so `ImagePreviewOverlay` can paint outside the compact
 * 280px canvas, or restore the compact bounds once the preview closes.
 * Mirrors macOS `NotchScreenMetrics.panelFrame(wide:)` attaching the
 * `floatingOverlay`, adapted to Electron's one-window model (Plan 14 "Task 6"
 * — no second `BrowserWindow`, since a second always-on-top/content-protected
 * window would split focus and capture-exclusion).
 *
 * **`workArea` vs. `screen.frame`:** macOS uses the raw `screen.frame` (the
 * overlay draws _under_ the menu bar). Windows has no menu-bar equivalent,
 * but every display reserves space for the taskbar — using the raw display
 * `bounds` here would let the wide window (and its overlay) draw fullscreen
 * OVER the taskbar, which reads as a broken/undocked window on Windows.
 * `workArea` (bounds minus taskbar) is the platform-idiomatic choice.
 */
export function setNotchPreviewActive(win: BrowserWindow | null, active: boolean): void {
	if (!win) return;
	if (active === previewActive) return;
	const wasResizable = win.isResizable();
	if (!wasResizable) win.setResizable(true);
	if (active) {
		compactBounds = win.getBounds();
		previewActive = true;
		const bounds = compactBounds;
		const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }) ?? screen.getPrimaryDisplay();
		win.setBounds(display.workArea);
		// The overlay must receive pointer and keyboard events (Escape/click-out)
		// while active. Stealing focus is intentional here: without it, a
		// click-through window cannot see the Escape key or dismiss clicks.
		win.setIgnoreMouseEvents(false, { forward: true });
		win.setFocusable(true);
		win.focus();
	} else {
		previewActive = false;
		if (compactBounds) {
			win.setBounds(compactBounds);
			compactBounds = null;
		}
		win.setFocusable(false);
		// Click-through state is re-synced by main.ts via
		// syncNotchMouseInteractiveState(); do not toggle it here.
	}
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

interface NotchBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

let previewOriginalBounds: NotchBounds | null = null;
let previewMode = false;

export function enterPreviewMode(win: BrowserWindow | null): void {
	if (!win || win.isDestroyed() || previewMode) return;
	previewMode = true;
	const current = win.getBounds();
	previewOriginalBounds = { x: current.x, y: current.y, width: current.width, height: current.height };
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;
	win.setBounds({ x: 0, y: 0, width, height });
	win.setResizable(true);
	win.setFocusable(true);
	win.setIgnoreMouseEvents(false);
}

export function exitPreviewMode(win: BrowserWindow | null): void {
	if (!win || win.isDestroyed() || !previewMode) return;
	previewMode = false;
	if (previewOriginalBounds) {
		win.setBounds(previewOriginalBounds);
	}
	win.setResizable(false);
	win.setFocusable(false);
	win.setIgnoreMouseEvents(true, { forward: true });
}

export function isPreviewMode(): boolean {
	return previewMode;
}
