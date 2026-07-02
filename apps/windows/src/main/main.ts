import { app, ipcMain, BrowserWindow, IpcMainInvokeEvent, Tray } from 'electron';
import path from 'node:path';
import { createMenuWindow, toggleMenuWindow } from './menu-window';
import { createNotchWindow, showNotch, hideNotch, updateNotch } from './notch-window';
import { focusNotchForReply, unfocusNotchAfterReply } from './notch-focus';
import { createPaletteWindow, showPalette, hidePalette } from './palette-window';
import { createTray } from './tray';
import { registerTogglePalette, unregisterShortcuts } from './shortcuts';
import { registerCryptoHandlers, deriveGroupId } from './crypto-channel';
import { IdentityStore } from './identity-store';
import { AppState } from './session-store';
import { registerSessionHandlers } from './session-handlers';
import { GitHubLoginService } from './github-login';
import { buildControlHandler } from './control-handlers';
import { createControlServer } from '../core/transport';
import { buildPipeName } from '../core/control';
import { broadcastStateUpdate } from './broadcast-state';
import type { WindowType } from '../shared/types';

// Pin the app name BEFORE anything reads userData. Without this, `electron`
// launched directly in dev falls back to the generic "Electron" name, so dev
// and packaged builds read DIFFERENT state.json stores (userData mismatch) —
// the root cause of persisted circles silently not loading (presence bug H-D).
app.setName('munkel');

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

function getWindowType(sender: Electron.WebContents): WindowType {
	const win = BrowserWindow.fromWebContents(sender);
	if (win === menuWindow) return 'menu';
	if (win === notchWindow) return 'notch';
	if (win === paletteWindow) return 'palette';
	return 'menu';
}

function togglePalette() {
	if (paletteWindow?.isVisible()) {
		hidePalette(paletteWindow);
	} else {
		showPalette(paletteWindow);
	}
}

function runNotchDemo() {
	if (!notchWindow) return;
	updateNotch(notchWindow, {
		sender: 'Munkel',
		text: 'This is a test notification. It will hide in 30 seconds.',
		isDirect: false,
		group: 'demo',
		groupColor: '#34c759',
	});
	showNotch(notchWindow);
	// 30s gives enough time to exercise ↩ Reply during manual QA (was 5s).
	setTimeout(() => hideNotch(notchWindow), 30_000);
}

function broadcastState(update: ReturnType<AppState['getState']>): void {
	broadcastStateUpdate(update, {
		menu: menuWindow?.webContents ?? null,
		palette: paletteWindow?.webContents ?? null,
		notch: notchWindow?.webContents ?? null,
	});
}

function showNotchMessage(message: import('../shared/types').NotchMessage): void {
	updateNotch(notchWindow, message);
	showNotch(notchWindow);
	notchWindow?.webContents.send('notch-message', message);
}

function relayError(message: string): void {
	menuWindow?.webContents.send('relay-error', message);
	paletteWindow?.webContents.send('relay-error', message);
}

function pushGitHubLoginState(state: import('../shared/types').GitHubLoginState): void {
	menuWindow?.webContents.send('github-login-state', state);
}

app.whenReady().then(async () => {
	menuWindow = createMenuWindow();
	notchWindow = createNotchWindow();
	paletteWindow = createPaletteWindow();

	try {
		tray = createTray({
			toggleMenu: () => toggleMenuWindow(menuWindow),
			showPalette: () => showPalette(paletteWindow),
			quit: () => app.quit(),
		});
	} catch (err) {
		console.error('[munkel] failed to create tray icon:', err);
	}

	registerTogglePalette(togglePalette);
	registerCryptoHandlers();

	// Phase-0 diagnostics (presence bug, H-D): the actual userData dir the app
	// reads state.json from. A mismatch vs the inspected file would mean persisted
	// circles never load → 0 sessions → 0 relay connections.
	console.error('[munkel] userData path:', app.getPath('userData'));
	const identityStore = new IdentityStore(app.getPath('userData'));
	const appState = new AppState(identityStore, broadcastState, showNotchMessage, relayError);
	const githubLoginService = new GitHubLoginService(appState, pushGitHubLoginState);
	registerSessionHandlers(appState, githubLoginService);

	// Named-pipe control server for the `munkel` CLI. Mirrors the macOS app's
	// Unix-domain-socket `ControlServer` — one request/response per connection,
	// same wire format. The CLI discovers the pipe by `buildPipeName()`.
	try {
		controlServer = await createControlServer(
			buildPipeName(),
			buildControlHandler(appState),
		);
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
	ipcMain.handle('show-palette', () => showPalette(paletteWindow));
	ipcMain.handle('toggle-menu', () => toggleMenuWindow(menuWindow));
	ipcMain.handle('quit-app', () => app.quit());
	ipcMain.handle('test-notch', () => runNotchDemo());
	ipcMain.handle('notch-begin-reply', (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		focusNotchForReply(notchWindow);
	});
	ipcMain.handle('notch-end-reply', (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		unfocusNotchAfterReply(notchWindow);
	});
	ipcMain.handle('start-github-login', async () => {
		githubLoginService.startGitHubLogin();
	});
	ipcMain.handle('cancel-github-login', async () => {
		githubLoginService.cancelGitHubLogin();
	});

	await appState.restoreCircles();
	appState.broadcast();

	if (process.env.NODE_ENV === 'development') {
		const groupId = await deriveGroupId('blue-table-42');
		console.log('[munkel-smoke] deriveGroupId(blue-table-42) =', groupId);
		if (groupId !== 'aaf5dc7308fe4bede46cdebc9390813d') {
			console.error('[munkel-smoke] GOLDEN VECTOR MISMATCH');
		}
	}
});

app.on('window-all-closed', () => {
	// The app lives in the tray; windows are only hidden.
});

app.on('before-quit', () => {
	unregisterShortcuts();
	void controlServer?.close();
	controlServer = null;
});
