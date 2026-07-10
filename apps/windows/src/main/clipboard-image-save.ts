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
 *    (`session-handlers.ts`) deletes the sent temp files via
 *    `cleanupClipboardTempPaths` — but ONLY paths this instance itself
 *    created (tracked in a main-side owned-paths set; see the function's
 *    doc comment for why a basename match alone must never authorize a
 *    deletion). On a FAILED send the files are intentionally kept — the
 *    renderer keeps the attachments for retry.
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
	// NaN guard: `NaN * NaN > cap` is false, so a hostile/broken getSize()
	// reporting NaN would sail past a bare threshold comparison.
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width <= 0 ||
		height <= 0 ||
		width * height > MAX_CLIPBOARD_PIXELS
	) {
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

/** True when `filePath`'s basename matches this module's naming scheme.
 * NOTE: this is a *naming* check only, never an authorization to delete —
 * any renderer-controllable path can be given a matching basename (e.g.
 * `C:\...\Documents\munkel-clipboard-evidence.png`). Deletion authority
 * comes exclusively from the per-instance owned-paths set (see
 * `cleanupClipboardTempPaths`); this check is a secondary filter. */
export function isClipboardTempPath(filePath: string): boolean {
	const base = filePath.split(/[/\\]/).pop() ?? '';
	return base.startsWith(CLIPBOARD_TEMP_PREFIX) && base.endsWith('.png');
}

export interface CleanupDeps {
	unlink(path: string): Promise<void>;
	tmpdir(): string;
	/** e.g. `node:path`'s `resolve` */
	resolve(...parts: string[]): string;
	/** e.g. `node:path`'s `sep` */
	sep: string;
}

/**
 * Deletes the clipboard temp files among `paths` (step 3 of the lifecycle —
 * call after a SUCCESSFUL send).
 *
 * The renderer chooses which paths it passes to `send-images`, so nothing
 * about a path string itself may grant deletion. A path is deleted only if
 * ALL of the following hold (review MAJOR "Datei-Lösch-Primitiv"):
 *
 * 1. **Ownership (the authorization):** the exact path string is in
 *    `ownedTempPaths` — the set of paths THIS instance's
 *    `save-clipboard-image` handler itself created and returned. A
 *    renderer-invented path (matching basename, `..` traversal, absolute
 *    foreign path) is never in the set and is skipped.
 * 2. Basename matches the module's naming scheme (secondary filter).
 * 3. The resolved path is inside the resolved tmpdir (secondary
 *    containment filter — paranoia against a corrupted set entry).
 *
 * Successfully deleted paths are removed from the set. Unlink errors are
 * logged and swallowed (the startup sweep is the backstop).
 */
export async function cleanupClipboardTempPaths(
	paths: string[],
	ownedTempPaths: Set<string>,
	deps: CleanupDeps,
): Promise<void> {
	const tmpRoot = deps.resolve(deps.tmpdir());
	for (const path of paths) {
		if (!ownedTempPaths.has(path)) continue;
		if (!isClipboardTempPath(path)) continue;
		const resolved = deps.resolve(path);
		if (!resolved.startsWith(tmpRoot + deps.sep)) continue;
		try {
			await deps.unlink(path);
			ownedTempPaths.delete(path);
		} catch (err) {
			console.warn('[munkel] failed to delete clipboard temp file (startup sweep will retry):', err);
		}
	}
}

/** Minimum age before the startup sweep may delete a leftover temp file.
 * The sweep runs at startup, before this instance has created anything, so
 * every matching file is stale in principle — but another *running*
 * instance (second-instance race during the single-instance-lock window,
 * or a dev build next to a packaged one) could have just written one. One
 * hour is far beyond any legitimate paste→send window. */
export const SWEEP_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Startup safety net (step 4 of the lifecycle): deletes leftover
 * `munkel-clipboard-*.png` files in the tmpdir that are older than
 * `SWEEP_MIN_AGE_MS`. The sweep only ever touches files directly inside
 * the tmpdir whose names match the module's scheme — it never receives
 * renderer input. All errors are swallowed — a failed sweep must never
 * block startup.
 */
export async function sweepClipboardTempFiles(deps: {
	tmpdir(): string;
	join(...parts: string[]): string;
	readdir(path: string): Promise<string[]>;
	stat(path: string): Promise<{ mtimeMs: number }>;
	unlink(path: string): Promise<void>;
	/** Wall clock for the age check; injectable for tests. */
	now?(): number;
}): Promise<void> {
	const now = deps.now ?? (() => Date.now());
	let names: string[];
	try {
		names = await deps.readdir(deps.tmpdir());
	} catch {
		return;
	}
	for (const name of names) {
		if (!isClipboardTempPath(name)) continue;
		const fullPath = deps.join(deps.tmpdir(), name);
		try {
			const { mtimeMs } = await deps.stat(fullPath);
			if (now() - mtimeMs < SWEEP_MIN_AGE_MS) continue; // possibly another live instance's file
			await deps.unlink(fullPath);
		} catch {
			// Ignore — e.g. another instance still holds the file, or it
			// vanished between readdir and stat.
		}
	}
}
