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

// Hover-"C" copy (Plan 12 P3.2) lives in `hover-copy-shortcut.ts`, which has
// no `electron` import of its own so its tests never touch the (possibly
// differently-mocked-elsewhere) `electron` module in this test process.
// `main.ts` imports `createHoverCopyController` from there directly and
// injects this module's `globalShortcut` as its API.
