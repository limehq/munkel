import { isValidAccelerator } from '../../shared/accelerator';

/** Minimal slice of `KeyboardEvent` this module depends on, so callers/tests
 * don't need a real DOM event. */
export interface HotkeyKeyboardEvent {
	key: string;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	metaKey: boolean;
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS']);

const NAMED_KEY_MAP: Record<string, string> = {
	' ': 'Space',
	Escape: 'Escape',
	Enter: 'Enter',
	Tab: 'Tab',
	Backspace: 'Backspace',
	Delete: 'Delete',
	Insert: 'Insert',
	Home: 'Home',
	End: 'End',
	PageUp: 'PageUp',
	PageDown: 'PageDown',
	ArrowUp: 'Up',
	ArrowDown: 'Down',
	ArrowLeft: 'Left',
	ArrowRight: 'Right',
};

const FUNCTION_KEY_PATTERN = /^F([1-9]|1\d|2[0-4])$/;

/**
 * Turns a captured `keydown` into an Electron accelerator string, or `null`
 * if the event isn't a usable combo yet (a bare modifier press — wait for
 * the next key) or can never be one (no modifier held, or a key with no
 * accelerator equivalent, e.g. CapsLock). The Recorder in `MenuWindow.tsx`
 * calls this on every `keydown` while armed and only commits a save on a
 * non-null result.
 */
export function acceleratorFromKeyboardEvent(e: HotkeyKeyboardEvent): string | null {
	if (MODIFIER_KEYS.has(e.key)) return null;

	const modifiers: string[] = [];
	if (e.ctrlKey) modifiers.push('Ctrl');
	if (e.altKey) modifiers.push('Alt');
	if (e.shiftKey) modifiers.push('Shift');
	if (e.metaKey) modifiers.push('Super');
	if (modifiers.length === 0) return null;

	let mainKey: string;
	if (NAMED_KEY_MAP[e.key]) {
		mainKey = NAMED_KEY_MAP[e.key];
	} else if (FUNCTION_KEY_PATTERN.test(e.key)) {
		mainKey = e.key.toUpperCase();
	} else if (e.key.length === 1) {
		mainKey = e.key.toUpperCase();
	} else {
		return null; // e.g. CapsLock, ContextMenu, media keys — no accelerator mapping
	}

	const accelerator = [...modifiers, mainKey].join('+');
	return isValidAccelerator(accelerator) ? accelerator : null;
}
