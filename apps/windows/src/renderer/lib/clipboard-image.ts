/**
 * Clipboard image paste (Plan 12 P3.4), mirroring macOS's clipboard-image
 * paste support in `CommandPalette` / `MenuView`.
 *
 * ## Why not `navigator.clipboard.read()`
 *
 * The Async Clipboard API's `read()` requires the `clipboard-read`
 * Permissions-Policy grant, which is unreliable (and sometimes silently
 * denied) in Electron's small, often-non-focused notch/palette/menu
 * `BrowserWindow`s used here — a permission prompt (or a silent rejection)
 * is not an acceptable UX for a plain Ctrl+V. Detecting *whether* the
 * clipboard currently holds an image is instead done synchronously from the
 * native `paste` DOM event's `clipboardData` (`ClipboardEvent.clipboardData`)
 * — every element always receives this on a genuine user-initiated paste, no
 * permission grant involved.
 *
 * Once an image is detected, the *bytes* are fetched through Electron's
 * native `clipboard.readImage()` in the main process (the
 * `save-clipboard-image` IPC channel — see `session-handlers.ts`) rather
 * than `clipboardData.items[i].getAsFile()`. That reuses the exact PNG
 * normalization Electron's `NativeImage` already performs OS-side for
 * PNG/JPEG/Bitmap clipboard contents, and returns a temp-file *path* so a
 * pasted image flows through the same `sendImages(paths)` pipeline (and its
 * `imageCodec` size/type limits) as a dialog-selected image, instead of a
 * separate raw-bytes code path.
 */

const IMAGE_TYPE_PATTERN = /^image\//;

/**
 * True if the given paste event's clipboard currently holds image data —
 * checked synchronously via `clipboardData.types` (never bare `'Files'`
 * alone, since a non-image file drag/paste also reports that type).
 */
export function clipboardEventHasImage(e: { clipboardData: DataTransfer | null }): boolean {
	const types = e.clipboardData?.types;
	if (!types) return false;
	return Array.from(types).some((type) => IMAGE_TYPE_PATTERN.test(type));
}

/**
 * Reads the OS clipboard's image (if any) through the main process and
 * returns a temp-file path suitable for the existing `sendImages(paths)`
 * pipeline. Returns `null` if the clipboard has no image, the IPC call
 * rejects, or the main process failed to save it (e.g. a disk write
 * failure) — callers should treat `null` the same as "no image, fall
 * through to normal text paste".
 */
export async function pasteClipboardImage(): Promise<string | null> {
	try {
		return (await window.electronAPI.saveClipboardImage()) ?? null;
	} catch (err) {
		console.error('[clipboard-image] paste failed', err);
		return null;
	}
}
