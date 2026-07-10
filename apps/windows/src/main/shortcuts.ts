import { globalShortcut } from 'electron';

export function unregisterShortcuts(): void {
	globalShortcut.unregisterAll();
}

// The palette-toggle hotkey (previously hardcoded here as `Ctrl+Shift+M`) is
// now rebindable (Plan 12 P3.1) and lives in `palette-hotkey.ts`, which —
// like `hover-copy-shortcut.ts` below — has no `electron` import of its own
// so its tests never touch the (possibly differently-mocked-elsewhere)
// `electron` module in this test process. `main.ts` injects this module's
// `globalShortcut` as its API.
//
// Hover-"C" copy (Plan 12 P3.2) lives in `hover-copy-shortcut.ts` for the
// same reason. `main.ts` imports `createHoverCopyController` from there
// directly and injects this module's `globalShortcut` as its API.
