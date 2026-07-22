/**
 * Electron `Accelerator` string validation shared between the main process
 * (`palette-hotkey.ts`, the authoritative validator before ever calling
 * `globalShortcut.register`) and the renderer (`hotkey-recorder.ts`, so the
 * settings-popover recorder can reject an obviously-invalid capture before
 * round-tripping to main). Both sides import this one copy — unlike
 * `MAX_IMAGES_PER_MESSAGE`-style constants that are deliberately duplicated
 * across bundles, this module has no electron/DOM dependency of its own, so
 * there's no reason to fork it (see `src/shared/ipc-channels.ts` for the
 * existing precedent of a dependency-free module shared by both bundles).
 *
 * Windows-focused: only the modifiers a Windows keyboard actually has are
 * accepted (`Ctrl`, `Alt`, `Shift`, `Super` for the Windows key) — no `Cmd`/
 * `Command`, which Electron only meaningfully binds on macOS.
 */

const MODIFIER_TOKENS = new Set(['Ctrl', 'Alt', 'Shift', 'Super']);

// Electron accelerator "key codes" this recorder can produce/accept: single
// printable characters (letters, digits, punctuation), function keys, and a
// fixed set of named keys. Deliberately excludes bare modifier names (a
// modifier alone is never a valid main key) and keys with no Electron
// accelerator equivalent (e.g. CapsLock, ContextMenu, media-transport keys
// beyond the common set below).
const MAIN_KEY_PATTERN =
	/^([A-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Space|Tab|Backspace|Delete|Insert|Return|Enter|Escape|Up|Down|Left|Right|Home|End|PageUp|PageDown|[`~!@#$%^&*()\-_=+[\]{}\\|;:'",.<>/?])$/;

/**
 * Modifiers that count towards the "at least one real modifier" requirement.
 * `Shift` alone is deliberately NOT enough: a bare `Shift+A` global shortcut
 * would swallow every capital "A" the user types anywhere on the system —
 * the classic single-modifier footgun. Shift is still allowed as an
 * *additional* modifier next to one of these (e.g. `Ctrl+Shift+M`).
 */
const STRONG_MODIFIER_TOKENS = new Set(['Ctrl', 'Alt', 'Super']);

/**
 * Validates an Electron accelerator string: requires **at least one
 * non-Shift modifier** (`Ctrl`/`Alt`/`Super`) plus **exactly one**
 * non-modifier main key, e.g. `"Ctrl+Shift+M"`. Rejects: no modifier
 * (`"M"`), Shift as the only modifier (`"Shift+A"` — see
 * STRONG_MODIFIER_TOKENS), only modifiers (`"Ctrl+Shift"`), duplicate
 * modifiers (`"Ctrl+Ctrl+M"`), unknown tokens, and non-string/empty input.
 */
export function isValidAccelerator(accelerator: unknown): accelerator is string {
	if (typeof accelerator !== 'string') return false;
	const trimmed = accelerator.trim();
	if (trimmed.length === 0) return false;

	const parts = trimmed.split('+').map((part) => part.trim());
	if (parts.some((part) => part.length === 0)) return false;
	if (parts.length < 2) return false;

	const mainKey = parts[parts.length - 1];
	const modifierParts = parts.slice(0, -1);

	if (modifierParts.length === 0) return false;
	if (!modifierParts.every((part) => MODIFIER_TOKENS.has(part))) return false;
	if (!modifierParts.some((part) => STRONG_MODIFIER_TOKENS.has(part))) return false; // Shift alone is not enough
	if (new Set(modifierParts).size !== modifierParts.length) return false; // no duplicate modifiers
	if (MODIFIER_TOKENS.has(mainKey)) return false; // main key must not itself be a modifier

	return MAIN_KEY_PATTERN.test(mainKey);
}

/** Default palette toggle hotkey — unchanged from the previous hardcoded value. */
export const DEFAULT_PALETTE_HOTKEY = 'Ctrl+Shift+M';

/** `"Ctrl+Shift+M"` → `"Ctrl + Shift + M"`, for display only. */
export function formatAcceleratorLabel(accelerator: string): string {
	return accelerator.split('+').join(' + ');
}
