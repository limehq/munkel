import type { BrowserWindow } from 'electron';

/**
 * Shared mutable state for the notch window's mouse-interactive mode.
 *
 * Keeping this tiny slice of module state in its own file makes the
 * `syncNotchMouseInteractiveState` decision unit-testable without importing
 * `main.ts`, which has heavy Electron app-lifecycle side effects.
 */
const state = {
	notchInteractive: false,
	/**
	 * Tracks the *click-through* side of the image preview overlay. This flag
	 * must stay in sync with the separate `previewActive` module state in
	 * `notch-window.ts`, which tracks the *window-bounds* side. The
	 * `notch-set-preview-active` handler in `main.ts` updates both before
	 * calling `syncNotchMouseInteractiveState`.
	 */
	previewActive: false,
};

export function setNotchInteractive(value: boolean): void {
	state.notchInteractive = value;
}

export function getNotchInteractive(): boolean {
	return state.notchInteractive;
}

export function setPreviewActive(value: boolean): void {
	state.previewActive = value;
}

export function getPreviewActive(): boolean {
	return state.previewActive;
}

/**
 * Single authority for the notch window's click-through state. The window is
 * only transparent to mouse hits when NEITHER the user is interacting with it
 * (`notchInteractive`) NOR a preview overlay is open (`previewActive`).
 * This prevents lifecycle/hover code from accidentally re-enabling
 * click-through while a preview is visible, which would trap the overlay.
 */
export function syncNotchMouseInteractiveState(notchWindow: BrowserWindow | null): void {
	if (!notchWindow || notchWindow.isDestroyed()) return;
	const ignore = !state.previewActive && !state.notchInteractive;
	try {
		notchWindow.setIgnoreMouseEvents(ignore, { forward: true });
	} catch (err) {
		console.error('[munkel] setIgnoreMouseEvents failed:', err);
	}
}
