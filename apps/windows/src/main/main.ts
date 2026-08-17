import { app, ipcMain, BrowserWindow, IpcMainInvokeEvent, Tray, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { createMenuWindow, showMenuWindow, toggleMenuWindow } from './menu-window';
import {
	createNotchWindow,
	showNotch,
	requestNotchHide,
	updateNotch,
	resizeNotchToContent,
	enterPreviewMode,
	exitPreviewMode,
	isPreviewMode,
	setNotchPreviewActive,
} from './notch-window';
import {
	setNotchInteractive,
	getNotchInteractive,
	setPreviewActive,
	syncNotchMouseInteractiveState,
} from './notch-interactive-state';
import { focusNotchForReply, unfocusNotchAfterReply } from './notch-focus';
import { createPaletteWindow, showPalette, hidePalette } from './palette-window';
import { createTray } from './tray';
import { createFakeNotchInjector } from './fake-notch-injector';
import { unregisterShortcuts } from './shortcuts';
import {
	createHoverCopyController,
	handleNotchSetInteractive,
	wireHoverCopyDisarm,
	type HoverCopyWindowLike,
} from './hover-copy-shortcut';
import { registerPaletteHotkey, rebindPaletteHotkey } from './palette-hotkey';
import { DEFAULT_PALETTE_HOTKEY } from '../shared/accelerator';
import { IdentityStore } from './identity-store';
import { applyLaunchAtLogin, setLaunchAtLoginPreference } from './login-item';
import { applyContentProtection } from './content-protection';
import { deriveGroupKeys } from '@munkel/shared-wire/crypto';
import { AppState } from './session-store';
import { registerSessionHandlers } from './session-handlers';
import { GitHubLoginService } from './github-login';
import { PresenceMonitor } from './presence-monitor';
import { ElectronIdleTimeSource } from './electron-idle-source';
import { buildControlHandler } from './control-handlers';
import { createControlServer } from '@munkel/shared-wire/transport';
import { buildPipeName, generatePipeName, getControlPipePath, writeControlPipeName } from '@munkel/shared-wire/control';
import { broadcastStateUpdate } from './broadcast-state';
import { isDismissSuppressed, isGitHubLoginActive } from './menu-dismiss';
import { initUpdateService } from './update-service';
import type { NotchMessage, UpdateState, WindowType } from '../shared/types';
import { IPC_CHANNELS, PUSH_CHANNELS } from '../shared/ipc-channels';

// Plan 15 (Startup performance) — startup marks (stderr so they show next to
// Electron logs). Suppress with MUNKEL_STARTUP_MARKS=0.
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
// Electron on Linux (unpackaged `dist/main.cjs`) can report getVersion() as
// `"0.0"` after setName, which makes electron-updater throw
// ERR_UPDATER_INVALID_VERSION and abort whenReady before IPC registers.
// Prefer the version from dist/package.json (scripts/write-dist-package.mjs).
try {
	const pkgPath = path.join(app.getAppPath(), 'package.json');
	const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
	const pinned = raw.version;
	if (typeof pinned === 'string' && /^\d+\.\d+\.\d+/.test(pinned) && app.getVersion() === '0.0') {
		app.getVersion = () => pinned;
	}
} catch {
	// packaged builds already have a valid version; ignore missing dist pkg
}
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
let fakeNotchInjector: ReturnType<typeof createFakeNotchInjector> | null = null;
let hoverCopyController: ReturnType<typeof createHoverCopyController> | null = null;
let disposeHoverCopyDisarm: (() => void) | null = null;
// Interactive flag lives in notch-interactive-state.ts so click-through can
// be shared with the preview overlay (see syncNotchMouseInteractiveState).
// Combined with `notchWindow?.isVisible()` this is the "visible + interactive"
// gate the hover-copy controller's `canArm` checks.
// Rebindable palette-toggle hotkey (Plan 12 P3.1): the accelerator string
// whose `globalShortcut` registration is CONFIRMED right now, or `null`
// while the hotkey is unbound (startup registration failed, or the rare
// rebind double-failure — see palette-hotkey.ts's confirmed-binding
// invariant, Kimi-Review of 24d6340). Kept in sync by the
// `set-palette-hotkey` handler, which always mirrors `rebindPaletteHotkey`'s
// actual outcome (rollback or heal-to-default on a failed rebind) rather
// than whatever the renderer requested. Never set to a value that isn't
// actually registered — the renderer displays this and must not claim a
// binding that doesn't exist.
let currentPaletteHotkey: string | null = null;
// Menu click-away-to-dismiss suppression state (Plan 06).
let pickerOpen = false;
let githubLoginActive = false;
// Dev-feature gate (Plan 13 items 5–6). MUST be `!app.isPackaged`, NOT an
// env var: `process.env.NODE_ENV` can be set by any launcher/shortcut/wrapper
// (the ELECTRON_RUN_AS_NODE-class leak), which would expose the dev toggles —
// and let a user turn OFF capture protection — in a shipped release build.
// `app.isPackaged` reflects the actual build shape and cannot be spoofed via
// the environment. Every dev-gated consumer (`get-is-dev`, the AppState echo
// fold, the startup + recreate content-protection apply) reads this one const.
const isDev = !app.isPackaged;
// Dev-only fake-notch injector is gated by the same `!app.isPackaged` posture
// (never active in a packaged/release build) plus the NODE_ENV=development
// signal that the launcher scripts set for actual bun-dev sessions.
const allowFakeInjector = process.env.NODE_ENV === 'development' && !app.isPackaged;

// Re-applies the persisted "Allow in screenshots" preference (Plan 13 item 5)
// to the current window set. Assigned inside `app.whenReady()` once the
// identity store and windows exist; a no-op before then. Kept as a
// module-level handle so the `second-instance` recreate path (below) can
// re-apply it to a freshly recreated menu window. In a packaged build `isDev`
// is false, so this always resolves to "protected" regardless of the
// persisted value.
let reapplyPersistedContentProtection: () => void = () => {};

/**
 * Creates the menu window with the Plan-06 click-away-dismiss suppression
 * callback wired in. Extracted so BOTH the initial `app.whenReady()` create
 * and the `second-instance` recreate below produce an identically-configured
 * window — the recreate previously called `createMenuWindow()` with no
 * options, silently dropping the dismiss guard.
 */
function makeMenuWindow(): BrowserWindow {
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
		menuWindow = makeMenuWindow();
		startupMark('window.menu.created');
		// Restore the persisted capture-protection state on the new window
		// (default-protected regardless, but keep dev flips consistent).
		reapplyPersistedContentProtection();
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

/**
 * Runs `run` when the window's initial load has completed. When lazily
 * created (Plan 15), a window's first `showX(...)` call can land before the
 * renderer has attached its IPC listeners — deferring the show/update/send
 * to `did-finish-load` avoids a dropped first message.
 */
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

function showNotchMessage(message: NotchMessage, opts?: { silent?: boolean }): void {
	const win = ensureNotchWindow();
	whenWindowReady(win, () => {
		updateNotch(win, message);
		showNotch(win);
		win.webContents.send(PUSH_CHANNELS.NOTCH_MESSAGE, { ...message, silent: opts?.silent ?? false });
	});
}

function relayError(message: string): void {
	menuWindow?.webContents.send(PUSH_CHANNELS.RELAY_ERROR, message);
	paletteWindow?.webContents.send(PUSH_CHANNELS.RELAY_ERROR, message);
}

function pushGitHubLoginState(state: import('../shared/types').GitHubLoginState): void {
	// Keep the menu open while the user may be in the browser entering the code.
	githubLoginActive = isGitHubLoginActive(state.phase);
	menuWindow?.webContents.send(PUSH_CHANNELS.GITHUB_LOGIN_STATE, state);
}

function pushUpdateState(state: UpdateState): void {
	menuWindow?.webContents.send(PUSH_CHANNELS.UPDATE_STATE, state);
	paletteWindow?.webContents.send(PUSH_CHANNELS.UPDATE_STATE, state);
}

app.whenReady().then(async () => {
	startupMark('whenReady');

	// Plan 15 Phase 1 — fake-notch injector uses `showNotchMessage` (which
	// lazily ensures the notch window), so it can be constructed before any
	// BrowserWindow exists. Create it BEFORE the tray so the tray's dev
	// callbacks can bind to a real injector handle from the start.
	if (allowFakeInjector) {
		fakeNotchInjector = createFakeNotchInjector({ inject: showNotchMessage });
	}

	// Plan 15 Phase 1 — tray first so the app signals life in the shell
	// before any Chromium window is spun up. Tray callbacks use `ensure*`
	// so lazy windows still work when opened via the tray.
	try {
		tray = createTray({
			toggleMenu: () => toggleMenuWindow(ensureMenuWindow()),
			showPalette: () => {
				const win = ensurePaletteWindow();
				whenWindowReady(win, () => showPalette(win));
			},
			checkForUpdates: () => updateService?.check(),
			quit: () => app.quit(),
			...(fakeNotchInjector
				? {
						toggleFakeNotchInjector: () => {
							if (!fakeNotchInjector) return;
							if (fakeNotchInjector.isRunning()) fakeNotchInjector.stop();
							else fakeNotchInjector.start();
						},
						fakeNotchInjectorRunning: () => fakeNotchInjector?.isRunning() ?? false,
					}
				: {}),
		});
		startupMark('tray');
	} catch (err) {
		console.error('[munkel] failed to create tray icon:', err);
	}

	// Menu window is needed for many IPC handlers below (sender guards) and
	// for the `second-instance` recreate path, so create it eagerly right
	// after the tray. Notch and palette stay lazy via `ensure*`.
	menuWindow = makeMenuWindow();
	startupMark('window.menu');

	// Palette-toggle hotkey registration (Plan 12 P3.1) happens below, once
	// the persisted accelerator is known — see `currentPaletteHotkey`.
	// Hover-"C" copy (Plan 12 P3.2): the notch renderer arms this (and keeps
	// it alive via mousemove activity pings) over NOTCH_SET_HOVER_COPY, but
	// the MAIN process owns the disarm lifecycle — controller-internal idle
	// timeout plus the hide / renderer-gone / destroyed / non-interactive
	// paths wired here. See hover-copy-shortcut.ts for the full rationale.
	hoverCopyController = createHoverCopyController(
		() => notchWindow?.webContents.send(PUSH_CHANNELS.NOTCH_COPY_HOVERED),
		globalShortcut,
		{
			// Late-Ping-Race gate (Iteration-5 re-review follow-up): only accept
			// a fresh arm while the notch window is actually visible AND the
			// renderer-reported `interactive` flag is current — rejects a late
			// activity ping that arrives after the notch already hid or went
			// non-interactive.
			canArm: () => !!notchWindow?.isVisible() && getNotchInteractive(),
		},
	);
	// The hover-copy disarm wiring needs a real BrowserWindow (it listens for
	// hide/render-process-gone/destroyed on the notch). Ensure the notch
	// window is created now — after the tray+menu are already up — so it
	// stays out of the tray-appear critical path but before any user action
	// could arm the hover-copy shortcut.
	//
	// BrowserWindow's overloaded `on` signatures don't structurally satisfy
	// the minimal HoverCopyWindowLike slice, hence the cast; the helper only
	// uses on('hide') and webContents.on('render-process-gone'|'destroyed').
	disposeHoverCopyDisarm = wireHoverCopyDisarm(
		hoverCopyController,
		ensureNotchWindow() as unknown as HoverCopyWindowLike,
	);

	// Phase-0 diagnostics (presence bug, H-D): the actual userData dir the app
	// reads state.json from. A mismatch vs the inspected file would mean persisted
	// circles never load → 0 sessions → 0 relay connections.
	console.error('[munkel] userData path:', app.getPath('userData'));
	const identityStore = new IdentityStore(app.getPath('userData'));
	let presenceMonitor: PresenceMonitor;
	const appState = new AppState(
		identityStore,
		broadcastState,
		(message) => showNotchMessage(message, { silent: presenceMonitor?.effectiveStatus !== 'online' }),
		relayError,
		{ isDev },
	);
	const githubLoginService = new GitHubLoginService(appState, pushGitHubLoginState);
	const idleSource = new ElectronIdleTimeSource();
	presenceMonitor = new PresenceMonitor({
		idleSource,
		identityStore,
		sessionStore: appState,
		onStatusChange: (status) => {
			// Broadcast a lightweight presence delta to every joined circle.
			appState.broadcastPresenceStatus(status);
		},
	});
	const persisted = identityStore.load();

	// Apply the persisted opt-in autostart choice (Plan 12 P2.1). Unlike the
	// macOS release, which auto-registers once on first launch, Windows never
	// auto-registers — this only ever re-applies what the user chose last.
	applyLaunchAtLogin(app, persisted.launchAtLogin);

	// Dev-only "Allow in screenshots" (Plan 13 item 5): only ever apply the
	// persisted opt-in outside protection when this IS a dev build (`isDev` =
	// `!app.isPackaged`) — a packaged release launched against a dev-populated
	// userData folder must still start fully capture-protected, matching macOS
	// having no such code path at all in release builds. Defined here (once the
	// store + windows exist) so the `second-instance` recreate path can reuse
	// it; reads the persisted value live so a runtime toggle flip is reflected
	// on a later recreate.
	reapplyPersistedContentProtection = () => {
		applyContentProtection(
			[menuWindow, notchWindow, paletteWindow],
			isDev && identityStore.load().allowInScreenshots,
		);
	};
	reapplyPersistedContentProtection();

	// Rebindable palette-toggle hotkey (Plan 12 P3.1): register the persisted
	// accelerator (default Ctrl+Shift+M). A startup registration failure
	// (e.g. another app already owns the combo) is logged but never fatal —
	// and `currentPaletteHotkey` then stays `null` (unbound) rather than
	// pretending the intended accelerator is bound (confirmed-binding
	// invariant): the settings recorder shows "Not bound" and a later
	// successful rebind heals the state without a restart.
	currentPaletteHotkey = registerPaletteHotkey(globalShortcut, persisted.paletteHotkey, togglePalette)
		? persisted.paletteHotkey
		: null;

	registerSessionHandlers(appState, githubLoginService, presenceMonitor, {
		// Only the two windows with a paste UI may pull images off the user's
		// clipboard via save-clipboard-image (Plan 12 P3.4 hardening); the
		// notch renders remote message content and must never read it.
		isImagePasteSender: (sender) => {
			const win = BrowserWindow.fromWebContents(sender);
			return win !== null && (win === paletteWindow || win === menuWindow);
		},
	});

	// Auto-update service. Packaged builds check on launch and every 24h when
	// the persisted "Check Automatically" preference (Plan 12 P3.7) allows
	// it; dev always skips. Manual "Check for Updates…" always works.
	updateService = initUpdateService(pushUpdateState, { isDev, autoCheckEnabled: persisted.autoUpdateCheck });

	// Register IPC before the control pipe. Windows/menu renderers invoke
	// channels as soon as they load; awaiting the control server first can
	// leave those invokes without handlers (e.g. a hung Win32 pipe path on
	// non-Windows hosts).
	ipcMain.handle(IPC_CHANNELS.GET_WINDOW_TYPE, (event: IpcMainInvokeEvent) => getWindowType(event.sender));
	ipcMain.handle(IPC_CHANNELS.HIDE_WINDOW, (event: IpcMainInvokeEvent) => {
		BrowserWindow.fromWebContents(event.sender)?.hide();
	});
	ipcMain.handle(IPC_CHANNELS.SHOW_PALETTE, () => {
		const win = ensurePaletteWindow();
		whenWindowReady(win, () => showPalette(win));
	});
	ipcMain.handle(IPC_CHANNELS.TOGGLE_MENU, () => toggleMenuWindow(ensureMenuWindow()));
	ipcMain.handle(IPC_CHANNELS.MENU_PICKER_STATE, (_event, open: boolean) => {
		// Renderer signals when a native picker (recipient <select>) is open so its
		// focus-stealing popup doesn't blur-dismiss the menu mid-selection.
		pickerOpen = !!open;
	});
	ipcMain.handle(IPC_CHANNELS.QUIT_APP, () => app.quit());
	ipcMain.handle(IPC_CHANNELS.NOTCH_BEGIN_REPLY, (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		focusNotchForReply(notchWindow);
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_END_REPLY, (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		unfocusNotchAfterReply(notchWindow);
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_SET_INTERACTIVE, (event, interactive: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		setNotchInteractive(!!interactive);
		syncNotchMouseInteractiveState(notchWindow);
		// Going click-through means the renderer may never get a mouseleave
		// for the pointer that armed the hover-copy shortcut — force-disarm.
		handleNotchSetInteractive(hoverCopyController, !!interactive);
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_EMPTY, (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		requestNotchHide(notchWindow);
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_SET_PREVIEW_MODE, (event, preview: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		if (preview) {
			enterPreviewMode(notchWindow);
		} else {
			exitPreviewMode(notchWindow);
		}
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_RESIZE, (event, contentHeight: number) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		resizeNotchToContent(notchWindow, contentHeight);
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_SET_HOVER_COPY, (event, active: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) {
			console.warn('[munkel] rejected notch-set-hover-copy from non-notch sender');
			return false;
		}
		// Returns false when arming failed (OS shortcut registration), so the
		// renderer can turn the feature off instead of assuming it is armed.
		return hoverCopyController?.setActive(!!active) ?? false;
	});
	// Image Quick-Look overlay (Plan 14). Main-owned download+decrypt so the
	// renderer never sees `messageKey` — same sender-guard posture as the
	// other notch-only channels above.
	ipcMain.handle(IPC_CHANNELS.NOTCH_LOAD_FULL_IMAGE, async (event, group: string, r2Key: string) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) {
			console.warn('[munkel] rejected notch-load-full-image from non-notch sender');
			return { ok: false };
		}
		const bytes = await appState.loadFullImage(group, r2Key);
		if (!bytes) return { ok: false };
		return { ok: true, data: Buffer.from(bytes).toString('base64') };
	});
	ipcMain.handle(IPC_CHANNELS.NOTCH_SET_PREVIEW_ACTIVE, (event, active: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== notchWindow) return;
		setPreviewActive(!!active);
		setNotchPreviewActive(notchWindow, !!active);
		syncNotchMouseInteractiveState(notchWindow);
	});
	ipcMain.handle(IPC_CHANNELS.START_GITHUB_LOGIN, async () => {
		githubLoginService.startGitHubLogin();
	});
	ipcMain.handle(IPC_CHANNELS.CANCEL_GITHUB_LOGIN, async () => {
		githubLoginService.cancelGitHubLogin();
	});
	ipcMain.handle(IPC_CHANNELS.CHECK_FOR_UPDATES, async (event: IpcMainInvokeEvent) => {
		if (!menuWindow || BrowserWindow.fromWebContents(event.sender) !== menuWindow) return { ok: false };
		return updateService?.check() ?? { ok: false };
	});
	ipcMain.handle(IPC_CHANNELS.INSTALL_UPDATE, async (event: IpcMainInvokeEvent) => {
		if (!menuWindow || BrowserWindow.fromWebContents(event.sender) !== menuWindow) return { ok: false };
		return updateService?.install() ?? { ok: false };
	});
	ipcMain.handle(IPC_CHANNELS.CONFIRM_INSTALL_UPDATE, async (event: IpcMainInvokeEvent) => {
		if (!menuWindow || BrowserWindow.fromWebContents(event.sender) !== menuWindow) return { ok: false };
		return updateService?.confirmInstall() ?? { ok: false };
	});
	ipcMain.handle(IPC_CHANNELS.CANCEL_INSTALL_UPDATE, async (event: IpcMainInvokeEvent) => {
		if (!menuWindow || BrowserWindow.fromWebContents(event.sender) !== menuWindow) return { ok: false };
		return updateService?.cancelInstall() ?? { ok: false };
	});
	// Autostart is a menu-only setting: the notch and palette renderers show
	// remote/message-derived content and must not be able to change it.
	// Same sender-guard pattern as the notch-* channels above.
	ipcMain.handle(IPC_CHANNELS.GET_LAUNCH_AT_LOGIN, (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return false;
		return identityStore.load().launchAtLogin;
	});
	ipcMain.handle(IPC_CHANNELS.SET_LAUNCH_AT_LOGIN, (event, enabled: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return false;
		// Handler logic lives in login-item.ts so it is unit-testable
		// (main.ts wiring has no test harness; see docs/ipc-contract.md).
		return setLaunchAtLoginPreference(app, identityStore, enabled);
	});
	// Auto-update "Check Automatically" toggle (Plan 12 P3.7). Same
	// menu-only sender guard as the launch-at-login channels above.
	ipcMain.handle(IPC_CHANNELS.GET_AUTO_UPDATE_CHECK, (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return true;
		return identityStore.load().autoUpdateCheck;
	});
	ipcMain.handle(IPC_CHANNELS.SET_AUTO_UPDATE_CHECK, (event, enabled: boolean) => {
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return false;
		const value = !!enabled;
		identityStore.patch({ autoUpdateCheck: value });
		updateService?.setAutoCheckEnabled(value);
		return true;
	});
	// Rebindable palette hotkey (Plan 12 P3.1). Same menu-only sender guard
	// as the launch-at-login / auto-update-check channels above — the
	// settings-popover recorder is the only UI that changes this.
	ipcMain.handle(IPC_CHANNELS.GET_PALETTE_HOTKEY, (event) => {
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return DEFAULT_PALETTE_HOTKEY;
		return currentPaletteHotkey;
	});
	ipcMain.handle(IPC_CHANNELS.SET_PALETTE_HOTKEY, (event, accelerator: unknown) => {
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) {
			console.warn('[munkel] rejected set-palette-hotkey from non-menu sender');
			return { ok: false, accelerator: currentPaletteHotkey, error: 'registration-failed' };
		}
		// rebindPaletteHotkey handler logic lives in palette-hotkey.ts so it is
		// unit-testable (main.ts wiring has no test harness; see
		// docs/ipc-contract.md — same pattern as login-item.ts).
		const result = rebindPaletteHotkey(globalShortcut, currentPaletteHotkey, accelerator, togglePalette);
		// Mirror the CONFIRMED binding exactly — including `null` (unbound)
		// after a rollback-failed double failure. Persist whatever is actually
		// bound (covers both a successful rebind and the heal-to-default
		// fallback, so a restart re-registers what the user really has); on
		// `null` the persisted value is left alone — the next startup retries
		// it, and a later successful rebind overwrites it.
		currentPaletteHotkey = result.accelerator;
		if (result.accelerator !== null) identityStore.patch({ paletteHotkey: result.accelerator });
		return result;
	});

	// Dev-only flag (Plan 13 items 5–6): lets the renderer gate the two
	// dev-only settings-popover toggles below without relying on a
	// nonexistent `window.electronAPI.isPackaged`. No sender guard needed —
	// it's read-only and identical for every window.
	ipcMain.handle(IPC_CHANNELS.GET_IS_DEV, () => isDev);

	// Dev-only "Allow in screenshots" (Plan 13 item 5). Same menu-only
	// sender guard as launch-at-login/auto-update-check/palette-hotkey
	// above, PLUS an `isDev` gate so a packaged build's own (nonexistent,
	// but defense-in-depth) UI could never flip this even if it tried.
	ipcMain.handle(IPC_CHANNELS.GET_ALLOW_IN_SCREENSHOTS, (event) => {
		if (!isDev) return false;
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return false;
		return identityStore.load().allowInScreenshots;
	});
	ipcMain.handle(IPC_CHANNELS.SET_ALLOW_IN_SCREENSHOTS, (event, enabled: boolean) => {
		if (!isDev) return false;
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) {
			console.warn('[munkel] rejected set-allow-in-screenshots from non-menu sender');
			return false;
		}
		const value = !!enabled;
		identityStore.patch({ allowInScreenshots: value });
		applyContentProtection([menuWindow, notchWindow, paletteWindow], value);
		return true;
	});

	// Dev-only "Echo my broadcasts" (Plan 13 item 6). Same gating posture as
	// the screenshot toggle above.
	ipcMain.handle(IPC_CHANNELS.GET_DEV_ECHO_BROADCASTS, (event) => {
		if (!isDev) return false;
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) return false;
		return appState.getDevEchoBroadcasts();
	});
	ipcMain.handle(IPC_CHANNELS.SET_DEV_ECHO_BROADCASTS, (event, enabled: boolean) => {
		if (!isDev) return false;
		if (BrowserWindow.fromWebContents(event.sender) !== menuWindow) {
			console.warn('[munkel] rejected set-dev-echo-broadcasts from non-menu sender');
			return false;
		}
		appState.setDevEchoBroadcasts(!!enabled);
		return true;
	});

	// Named-pipe / Unix-socket control server for the `munkel` CLI. One
	// request/response per connection. Unpredictable name published to a
	// user-private file (Node cannot set a Windows DACL directly). Started
	// after IPC so a listen hang never blocks the tray/menu/notch.
	const controlPipeName = generatePipeName();
	try {
		controlServer = await createControlServer(
			controlPipeName,
			buildControlHandler(appState),
		);
		writeControlPipeName(controlPipeName);
		startupMark('control');
		console.log(`[munkel] control pipe: ${controlPipeName}`);
	} catch (err) {
		// Don't abort startup: another instance may already own the pipe and
		// the single-instance lock above would have caught that. Surface a
		// hint so the user can investigate if `munkel circles` can't connect.
		console.error('[munkel] control pipe failed to start:', err);
	}

	await appState.restoreCircles();
	startupMark('restoreCircles');
	appState.broadcast();

	// Dev diagnostic only — gate on the same unspoofable `isDev`
	// (`!app.isPackaged`) as everything else, so a release never prints the
	// smoke log even if launched with NODE_ENV=development.
	if (isDev) {
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
	fakeNotchInjector?.dispose();
	fakeNotchInjector = null;
	// Disarm before the blanket unregisterAll so the controller's internal
	// state (and pending idle timer) is cleaned up, not just the OS binding.
	hoverCopyController?.dispose();
	hoverCopyController = null;
	disposeHoverCopyDisarm?.();
	disposeHoverCopyDisarm = null;
	unregisterShortcuts();
	void controlServer?.close();
	controlServer = null;
	updateService?.dispose();
	updateService = null;
	// Remove the published pipe name so stale entries don't confuse a future
	// CLI invocation after the app has quit.
	try {
		fs.unlinkSync(getControlPipePath());
	} catch {
		// ignore cleanup errors
	}
});
