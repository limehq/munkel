import { Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TrayHandlers {
	toggleMenu: () => void;
	showPalette: () => void;
	checkForUpdates: () => void;
	quit: () => void;
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

export function createTray(handlers: TrayHandlers): Tray {
	const icon = loadTrayIcon();
	const tray = new Tray(icon);

	tray.setToolTip('Munkel');
	tray.on('click', () => {
		console.log('[tray] click fired');
		handlers.toggleMenu();
	});
	tray.on('double-click', () => {
		console.log('[tray] double-click fired');
		handlers.toggleMenu();
	});

	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Show Menu', click: handlers.toggleMenu },
		{ label: 'Quick send…', click: handlers.showPalette },
		{ label: 'Check for Updates…', click: handlers.checkForUpdates },
		{ type: 'separator' },
		{ label: 'Quit', click: handlers.quit },
	]);

	// On Windows, setting a context menu suppresses the click/double-click events.
	// Keep the menu for non-Windows platforms and pop it manually on right-click.
	if (process.platform !== 'win32') {
		tray.setContextMenu(contextMenu);
	}

	tray.on('right-click', (event, bounds) => {
		console.log('[tray] right-click fired');
		if (process.platform === 'win32') {
			tray.popUpContextMenu(contextMenu, bounds);
		}
	});

	return tray;
}
