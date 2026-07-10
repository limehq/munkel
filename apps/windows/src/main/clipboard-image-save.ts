/**
 * Clipboard-image temp-file save + cleanup (Plan 12 P3.4 hardening).
 *
 * Handler logic for the `save-clipboard-image` IPC channel, extracted from
 * `session-handlers.ts` so it is unit-testable without Electron — the same
 * dependency-injection posture as `login-item.ts` / `hover-copy-shortcut.ts`
 * (the caller injects the `NativeImage` slice and the fs functions).
 *
 * ## Lifecycle of a clipboard temp file
 *
 * 1. Created here on a successful Ctrl+V image paste (`munkel-clipboard-*.png`
 *    in the OS tmpdir), path returned to the renderer.
 * 2. The renderer carries the path in its `imagePaths` attachment list —
 *    same shape as a `select-images` dialog pick.
 * 3. The path's lifecycle ends when the album send **succeeds**: the
 *    renderer clears its attachment list, and the `send-images` IPC handler
 *    (`session-handlers.ts`) deletes any clipboard temp files among the
 *    sent paths via `cleanupClipboardTempPaths`. On a FAILED send the files
 *    are intentionally kept — the renderer keeps the attachments for retry.
 * 4. Safety net: files that never reach step 3 (attachment removed by hand,
 *    app quit before sending, crash) are swept by `sweepClipboardTempFiles`
 *    at the next app startup. Only files matching the app-specific
 *    `CLIPBOARD_TEMP_PREFIX`/`.png` pattern are ever touched; anything from
 *    a previous session is stale by definition, so the sweep needs no age
 *    check.
 */

/** Minimal slice of Electron's `NativeImage` this module needs. */
export interface ClipboardImageLike {
	isEmpty(): boolean;
	getSize(): { width: number; height: number };
	toPNG(): Uint8Array;
}

export const CLIPBOARD_TEMP_PREFIX = 'munkel-clipboard-';

/**
 * Decoded-pixel cap checked BEFORE the expensive `toPNG()` encode and disk
 * write. `clipboard.readImage()` hands us an already-decoded bitmap, so the
 * cheap `getSize()` probe is the earliest possible rejection point for a
 * clipboard bomb. Derived from the codec's own `MAX_FULL_PIXELS` (2048 —
 * `sendImages` downsamples everything to that longest side anyway, so
 * nothing above this cap could ever add quality): 8 × 2048² ≈ 33.5 MP,
 * which still admits a full 8K screenshot (7680 × 4320 ≈ 33.2 MP) while
 * rejecting absurd decoded sizes whose PNG encode would stall the main
 * process. Kept here (not imported) to avoid pulling `image-codec.ts`'s
 * WASM/`image-size` deps into this tiny module; the derivation is the
 * contract, the literal is the mirror.
 */
export const MAX_CLIPBOARD_PIXELS = 8 * 2048 * 2048;

export interface SaveClipboardImageDeps {
	/** e.g. `os.tmpdir` */
	tmpdir(): string;
	/** e.g. `node:path`'s `join` */
	join(...parts: string[]): string;
	/** e.g. `node:fs/promises`' `writeFile` */
	writeFile(path: string, data: Uint8Array): Promise<void>;
	/** Unique filename suffix; injectable for deterministic tests. */
	uniqueSuffix?(): string;
}

/**
 * Validates and writes the clipboard image to a temp PNG file. Returns the
 * file path, or `null` when the clipboard has no image, the image exceeds
 * `MAX_CLIPBOARD_PIXELS`, or the write failed — the renderer treats every
 * `null` as "no image, fall through to text paste".
 */
export async function saveClipboardImageToTemp(
	image: ClipboardImageLike,
	deps: SaveClipboardImageDeps,
): Promise<string | null> {
	if (image.isEmpty()) return null;

	const { width, height } = image.getSize();
	if (width <= 0 || height <= 0 || width * height > MAX_CLIPBOARD_PIXELS) {
		console.warn(
			`[munkel] rejected clipboard image paste: ${width}×${height} exceeds the ${MAX_CLIPBOARD_PIXELS}-pixel cap`,
		);
		return null;
	}

	const suffix = deps.uniqueSuffix?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	const tempPath = deps.join(deps.tmpdir(), `${CLIPBOARD_TEMP_PREFIX}${suffix}.png`);
	try {
		await deps.writeFile(tempPath, image.toPNG());
	} catch (err) {
		console.error('[munkel] failed to save clipboard image to temp file:', err);
		return null;
	}
	return tempPath;
}

/** True when `filePath` names a file this module created (used to decide
 * which sent paths the `send-images` handler may delete — dialog-picked
 * user files must never be touched). Matches on the basename only, so it
 * works regardless of which tmpdir spelling the path carries. */
export function isClipboardTempPath(filePath: string): boolean {
	const base = filePath.split(/[/\\]/).pop() ?? '';
	return base.startsWith(CLIPBOARD_TEMP_PREFIX) && base.endsWith('.png');
}

/**
 * Deletes the clipboard temp files among `paths` (step 3 of the lifecycle —
 * call after a SUCCESSFUL send). Non-clipboard paths are ignored; unlink
 * errors are logged and swallowed (the startup sweep is the backstop).
 */
export async function cleanupClipboardTempPaths(
	paths: string[],
	unlink: (path: string) => Promise<void>,
): Promise<void> {
	for (const path of paths) {
		if (!isClipboardTempPath(path)) continue;
		try {
			await unlink(path);
		} catch (err) {
			console.warn('[munkel] failed to delete clipboard temp file (startup sweep will retry):', err);
		}
	}
}

/**
 * Startup safety net (step 4 of the lifecycle): deletes every leftover
 * `munkel-clipboard-*.png` in the tmpdir from previous sessions. All errors
 * are swallowed — a failed sweep must never block startup.
 */
export async function sweepClipboardTempFiles(deps: {
	tmpdir(): string;
	join(...parts: string[]): string;
	readdir(path: string): Promise<string[]>;
	unlink(path: string): Promise<void>;
}): Promise<void> {
	let names: string[];
	try {
		names = await deps.readdir(deps.tmpdir());
	} catch {
		return;
	}
	for (const name of names) {
		if (!isClipboardTempPath(name)) continue;
		try {
			await deps.unlink(deps.join(deps.tmpdir(), name));
		} catch {
			// Ignore — e.g. another instance still holds the file.
		}
	}
}
