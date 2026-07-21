import { app, ipcMain, BrowserWindow, IpcMainInvokeEvent, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createMenuWindow, showMenuWindow, toggleMenuWindow } from './menu-window';
import { createNotchWindow, showNotch, requestNotchHide, updateNotch } from './notch-window';
import { focusNotchForReply, unfocusNotchAfterReply } from './notch-focus';
import { createPaletteWindow, showPalette, hidePalette } from './palette-window';
import { createTray } from './tray';
import { registerTogglePalette, unregisterShortcuts } from './shortcuts';
import { IdentityStore } from './identity-store';
import { deriveGroupKeys } from '@munkel/shared-wire/crypto';
import { AppState } from './session-store';
import { registerSessionHandlers } from './session-handlers';
import { GitHubLoginService } from './github-login';
import { buildControlHandler } from './control-handlers';
import { createControlServer } from '@munkel/shared-wire/transport';
import { buildPipeName } from '@munkel/shared-wire/control';
import { broadcastStateUpdate } from './broadcast-state';
import { isDismissSuppressed, isGitHubLoginActive } from './menu-dismiss';
import { initUpdateService } from './update-service';
import type { NotchMessage, UpdateState, WindowType } from '../shared/types';

// Plan 12 Phase 0 — startup marks (stderr so they show next to Electron logs).
const startupT0 = Date.now();
function startupMark(label: string): void {
	if (process.env.MUNKEL_STARTUP_MARKS === '0') return;
	console.error(`[startup] ${label} +${Date.now() - startupT0}ms`);
}
startupMark('requires.done');

// Pin the app name BEFORE anything reads userData. Without this, `electron`
// launched directly in dev falls back to the generic "Electron" name, so dev
// and packaged builds read DIFFERENT state.json stores (userData mismatch) —
// the root cause of persisted circles silently not loading (presence bug H-D).
app.setName('munkel');
const pinnedUserData = path.join(app.getPath('appData'), 'munkel');
fs.mkdirSync(pinnedUserData, { recursive: true });
app.setPath('userData', pinnedUserData);
app.setAppUserModelId('app.munkel.windows');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	app.quit();
	process.exit(0);
}

let menuWindow: BrowserWindow | null = null;
let notchWindow: BrowserWindow | null = null;
let paletteWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let controlServer: { close(): Promise<void> } | null = null;
let updateService: ReturnType<typeof initUpdateService> | null = null;
// Menu click-away-to-dismiss suppression state (Plan 06).
let pickerOpen = false;
let githubLoginActive = false;
const isDev = process.env.NODE_ENV === 'development';

function createMenu(): BrowserWindow {
	return createMenuWindow({
		isDismissSuppressed: () =>
			isDismissSuppressed({
				pickerOpen,
				githubLoginActive,
				devToolsOpen: menuWindow?.webContents.isDevToolsOpened() ?? false,
				isDev,
			}),
	});
}

function ensureMenuWindow(): BrowserWindow {
	if (!menuWindow || menuWindow.isDestroyed()) {
		menuWindow = createMenu();
	}
	return menuWindow;
}

function ensureNotchWindow(): BrowserWindow {
	if (!notchWindow || notchWindow.isDestroyed()) {
		notchWindow = createNotchWindow();
		startupMark('window.notch.created');
	}
	return notchWindow;
}

function ensurePaletteWindow(): BrowserWindow {
	if (!paletteWindow || paletteWindow.isDestroyed()) {
		paletteWindow = createPaletteWindow();
		startupMark('window.palette.created');
	}
	return paletteWindow;
}

function whenWindowReady(win: BrowserWindow, run: () => void): void {
	if (win.webContents.isLoading()) {
		win.webContents.once('did-finish-load', run);
		return;
	}
	run();
}

app.on('second-instance', () => {
	showMenuWindow(ensureMenuWindow());
});

function getWindowType(sender: Electron.WebContents): WindowType {
	const win = BrowserWindow.fromWebContents(sender);
	if (win === menuWindow) return 'menu';
	if (win === notchWindow) return 'notch';
	if (win === paletteWindow) return 'palette';
	return 'menu';
}

function togglePalette() {
	const win = ensurePaletteWindow();
	if (win.isVisible()) {
		hidePalette(win);
	} else {
		whenWindowReady(win, () => showPalette(win));
	}
}

function broadcastState(update: ReturnType<AppState['getState']>): void {
	broadcastStateUpdate(update, {
		menu: menuWindow?.webContents ?? null,
		palette: paletteWindow?.webContents ?? null,
		notch: notchWindow?.webContents ?? null,
	});
}

function showNotchMessage(message: NotchMessage): void {
	const win = ensureNotchWindow();
	whenWindowReady(win, () => {
		updateNotch(win, message);
		showNotch(win);
		win.webContents.send('notch-message', message);
	});
}

function relayError(message: string): void {
	menuWindow?.webContents.send('relay-error', message);
	paletteWindow?.webContents.send('relay-error', message);
}

function pushGitHubLoginState(state: import('../shared/types').GitHubLoginState): void {
	// Keep the menu open while the user may be in the browser entering the code.
	githubLoginActive = isGitHubLoginActive(state.phase);
	menuWindow?.webContents.send('github-login-state', state);
}

function pushUpdateState(state: UpdateState): void {
	menuWindow?.webContents.send('update-state', state);
	paletteWindow?.webContents.send('update-state', state);
}

app.whenReady().then(async () => {
	startupMark('whenReady');

	// Plan 12 Phase 1.1 — tray first so the app signals life before Chromium windows.
	try {
		tray = createTray({
			toggleMenu: () => toggleMenuWindow(ensureMenuWindow()),
			showPalette: () => {
				const win = ensurePaletteWindow();
				whenWindowReady(win, () => showPalette(win));
			},
			checkForUpdates: () => updateService?.check(),
			quit: () => app.quit(),
		});
		startupMark('tray');
	} catch (err) {
		console.error('[munkel] failed to create tray icon:', err);
	}

	// Menu is needed for tray open; create after tray. Notch/Palette stay lazy (1.2).
	menuWindow = createMenu();
	startupMark('window.menu');

	registerTogglePalette(togglePalette);

	// Phase-0 diagnostics (presence bug, H-D): the actual userData dir the app
	// reads state.json from. A mismatch vs the inspected file would mean persisted
	// circles never load → 0 sessions → 0 relay connections.
	console.error('[munkel] userData path:', app.getPath('userData'));
	const identityStore = new IdentityStore(app.getPath('userData'));
	const appState = new AppState(identityStore, broadcastState, showNotchMessage, relayError);
	const githubLoginService = new GitHubLoginService(appState, pushGitHubLoginState);
	registerSessionHandlers(appState, githubLoginService);

	// Auto-update service. Packaged builds check on launch and every 24h; dev skips.
	updateService = initUpdateService(pushUpdateState, { isDev });

	// Named-pipe control server for the `munkel` CLI. Mirrors the macOS app's
	// Unix-domain-socket `ControlServer` — one request/response per connection,
	// same wire format. The CLI discovers the pipe by `buildPipeName()`.
	try {
		controlServer = await createControlServer(
			buildPipeName(),
			buildControlHandler(appState),
		);
		startupMark('control');
		console.log(`[munkel] control pipe: ${buildPipeName()}`);
	} catch (err) {
		// Don't abort startup: another instance may already own the pipe and
		// the single-instance lock above would have caught that. Surface a
		// hint so the user can investigate if `munkel circles` can't connect.
		console.error('[munkel] control pipe failed to start:', err);
	}

	ipcMain.handle('get-window-type', (event: IpcMainInvokeEvent) => getWindowType(event.sender));
	ipcMain.handle('hide-window', (event: IpcMainInvokeEvent) => {
		BrowserWindow.fromWebContents(event.sender)?.hide();
	});
	ipcMain.handle('show-palette', () => {
		const win = ensurePaletteWindow();
		whenWindowReady(win, () => showPalette(win));
	});
	ipcMain.handle('toggle-menu', () => toggleMenuWindow(ensureMenuWindow()));
	ipcMain.handle('menu-picker-state', (_event, open: boolean) => {
		// Renderer signals when a native picker (recipient <select>) is open so its
		// focus-stealing popup doesn't blur-dismiss the menu mid-selection.
		pickerOpen = !!open;
	});
	ipcMain.handle('quit-app', () => app.quit());
	ipcMain.handle('notch-begin-reply', (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		focusNotchForReply(notchWindow);
	});
	ipcMain.handle('notch-end-reply', (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		unfocusNotchAfterReply(notchWindow);
	});
	ipcMain.handle('notch-set-interactive', (event, interactive: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		notchWindow?.setIgnoreMouseEvents(!interactive, { forward: true });
	});
	ipcMain.handle('notch-empty', (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		requestNotchHide(notchWindow);
	});
	ipcMain.handle('start-github-login', async () => {
		githubLoginService.startGitHubLogin();
	});
	ipcMain.handle('cancel-github-login', async () => {
		githubLoginService.cancelGitHubLogin();
	});
	ipcMain.handle('check-for-updates', async () => {
		updateService?.check();
	});
	ipcMain.handle('install-update', async () => {
		updateService?.install();
	});

	await appState.restoreCircles();
	startupMark('restoreCircles');
	appState.broadcast();

	if (process.env.NODE_ENV === 'development') {
		const { groupId } = await deriveGroupKeys('blue-table-42');
		console.log('[munkel-smoke] deriveGroupKeys(blue-table-42) =', groupId);
		if (groupId !== 'aaf5dc7308fe4bede46cdebc9390813d') {
			console.error('[munkel-smoke] GOLDEN VECTOR MISMATCH');
		}
	}
	startupMark('whenReady.done');
});

app.on('window-all-closed', () => {
	// The app lives in the tray; windows are only hidden.
});

app.on('before-quit', () => {
	unregisterShortcuts();
	void controlServer?.close();
	controlServer = null;
	updateService?.dispose();
	updateService = null;
});
