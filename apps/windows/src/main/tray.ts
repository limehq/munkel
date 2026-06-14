import { Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TrayHandlers {
	toggleMenu: () => void;
	showPalette: () => void;
	quit: () => void;
}

export function createTray(handlers: TrayHandlers): Tray {
	const assetDir = path.join(__dirname, '../assets');
	const pngPath = path.join(assetDir, 'tray-icon.png');
	const svgPath = path.join(assetDir, 'tray-icon.svg');
	const iconPath = fs.existsSync(pngPath) ? pngPath : svgPath;
	const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
	const tray = new Tray(icon);

	tray.setToolTip('Munkel');
	tray.on('click', handlers.toggleMenu);

	const contextMenu = Menu.buildFromTemplate([
		{ label: 'Show Menu', click: handlers.toggleMenu },
		{ label: 'Quick send…', click: handlers.showPalette },
		{ type: 'separator' },
		{ label: 'Quit', click: handlers.quit },
	]);
	tray.setContextMenu(contextMenu);

	return tray;
}
