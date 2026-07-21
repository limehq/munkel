import { Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { debugTray } from './logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TrayHandlers {
	toggleMenu: () => void;
	showPalette: () => void;
	checkForUpdates: () => void;
	quit: () => void;
	/** DEV-only: toggle the fake notch message injector. */
	toggleFakeNotchInjector?: () => void;
	/** DEV-only: whether the fake injector is currently running. */
	fakeNotchInjectorRunning?: () => boolean;
}

function loadTrayIcon(): Electron.NativeImage {
	const assetDir = path.join(__dirname, '../assets');
	// Prefer the 32x32 PNG on Windows: Electron scales it automatically for the
	// current DPI, and it stays crisp on high-DPI taskbars. SVG is *not* used as
	// a fallback on Windows because nativeImage.createFromPath SVG support is
	// unreliable there.
	const candidates = [
		path.join(assetDir, 'tray-icon-32.png'),
		path.join(assetDir, 'tray-icon-24.png'),
		path.join(assetDir, 'tray-icon.png'),
	];
	for (const iconPath of candidates) {
		if (fs.existsSync(iconPath)) {
			const icon = nativeImage.createFromPath(iconPath);
			if (!icon.isEmpty()) return icon;
		}
	}
	throw new Error('No usable tray icon found in ' + assetDir);
}

function buildTrayMenuTemplate(handlers: TrayHandlers, rebuild: () => void): Electron.MenuItemConstructorOptions[] {
	const items: Electron.MenuItemConstructorOptions[] = [
		{ label: 'Show Menu', click: handlers.toggleMenu },
		{ label: 'Quick send…', click: handlers.showPalette },
		{ label: 'Check for Updates…', click: handlers.checkForUpdates },
	];

	if (handlers.toggleFakeNotchInjector) {
		items.push(
			{ type: 'separator' },
			{
				label: 'Inject fake notch messages',
				type: 'checkbox',
				checked: handlers.fakeNotchInjectorRunning?.() ?? false,
				click: () => {
					handlers.toggleFakeNotchInjector?.();
					rebuild();
				},
			},
		);
	}

	items.push({ type: 'separator' }, { label: 'Quit', click: handlers.quit });
	return items;
}

/**
 * Rebuild the tray context menu from the current handlers (checkbox state, etc.).
 * On Windows this is a no-op for the sticky context menu (click events would be
 * suppressed); the menu is rebuilt on each right-click popup instead.
 */
export function rebuildTrayMenu(tray: Tray, handlers: TrayHandlers): void {
	if (process.platform === 'win32') {
		return;
	}
	const rebuild = () => rebuildTrayMenu(tray, handlers);
	tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate(handlers, rebuild)));
}

export function createTray(handlers: TrayHandlers): Tray {
	const icon = loadTrayIcon();
	const tray = new Tray(icon);

	tray.setToolTip('Munkel');
	tray.on('click', () => {
		debugTray('click fired');
		handlers.toggleMenu();
	});
	tray.on('double-click', () => {
		debugTray('double-click fired');
		handlers.toggleMenu();
	});

	// On Windows, setting a context menu suppresses the click/double-click events.
	// Keep the menu for non-Windows platforms and pop it manually on right-click.
	if (process.platform !== 'win32') {
		rebuildTrayMenu(tray, handlers);
	} else {
		tray.on('right-click', (_event, bounds) => {
			debugTray('right-click fired');
			const rebuild = () => {
				/* next right-click rebuilds via buildTrayMenuTemplate */
			};
			const menu = Menu.buildFromTemplate(buildTrayMenuTemplate(handlers, rebuild));
			tray.popUpContextMenu(menu, bounds);
		});
	}

	return tray;
}
