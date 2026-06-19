import { globalShortcut } from 'electron';

export function registerTogglePalette(togglePalette: () => void): void {
	const registered = globalShortcut.register('Ctrl+Shift+M', () => {
		togglePalette();
	});
	if (!registered) {
		console.warn('Failed to register Ctrl+Shift+M global shortcut');
	}
}

export function unregisterShortcuts(): void {
	globalShortcut.unregisterAll();
}
