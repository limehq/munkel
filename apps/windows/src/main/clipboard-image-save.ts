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
 * 1. Created here on a successful Ctrl+V image paste inside a private
 *    per-instance directory (`munkel-clipboard-dir-XXXXXX`, created lazily
 *    via `mkdtemp` under the OS tmpdir; POSIX mode 0o700, files 0o600). The
 *    file is `munkel-clipboard-*.png`; its path is returned to the renderer.
 *    On Windows the mode bits are essentially ignored by Node, so the
 *    directory is NOT an access-control boundary there: it only isolates
 *    our files from the shared tmpdir (unguessable name, one place to
 *    delete) and confidentiality still rests on the user-profile ACL of
 *    %TEMP%.
 * 2. The renderer carries the path in its `imagePaths` attachment list —
 *    same shape as a `select-images` dialog pick.
 * 3. The path's lifecycle ends when the album send **succeeds**: the
 *    renderer clears its attachment list, and the `send-images` IPC handler
 *    (`session-handlers.ts`) deletes the sent temp files via
 *    `cleanupClipboardTempPaths` — but ONLY paths this instance itself
 *    created (tracked in a main-side owned-paths set; see the function's
 *    doc comment for why a basename match alone must never authorize a
 *    deletion). On a FAILED send the files are intentionally kept — the
 *    renderer keeps the attachments for retry within the session.
 * 4. At app quit (`will-quit`) `removeOwnedClipboardTempFilesSync` deletes
 *    every still-owned file and then the private directory.
 * 5. Safety net for crashes and forced kills: `sweepClipboardTempFiles` at
 *    the next startup deletes old schema files inside leftover private
 *    directories (and legacy files lying directly in the tmpdir).
 */

/** Minimal slice of Electron's `NativeImage` this module needs. */
export interface ClipboardImageLike {
	isEmpty(): boolean;
	getSize(): { width: number; height: number };
	toPNG(): Uint8Array;
}

export const CLIPBOARD_TEMP_PREFIX = 'munkel-clipboard-';

export const CLIPBOARD_TEMP_DIR_PREFIX = 'munkel-clipboard-dir-';

export interface ClipboardTempDir {
	ensure(): Promise<string>;
	current(): string | null;
	reset(): void;
}

/** Lazily creates one private directory per app instance (`mkdtemp` yields
 * an unguessable name; POSIX mode 0o700) and reuses it. A failed creation is
 * not cached, so a later paste can retry. `reset` drops the cached path (e.g.
 * after another instance's sweep removed the directory). */
export function createClipboardTempDir(deps: {
	tmpdir(): string;
	join(...parts: string[]): string;
	mkdtemp(prefix: string): Promise<string>;
}): ClipboardTempDir {
	let dir: string | null = null;
	let pending: Promise<string> | null = null;
	return {
		ensure() {
			if (dir !== null) return Promise.resolve(dir);
			pending ??= deps
				.mkdtemp(deps.join(deps.tmpdir(), CLIPBOARD_TEMP_DIR_PREFIX))
				.then((created) => {
					dir = created;
					return created;
				})
				.finally(() => {
					pending = null;
				});
			return pending;
		},
		current: () => dir,
		reset() {
			dir = null;
		},
	};
}

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
	/** Resolves the private per-instance directory (see `createClipboardTempDir`). */
	ensureDir(): Promise<string>;
	/** Drops the cached directory so the next `ensureDir` creates a fresh one. */
	resetDir?(): void;
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
	const filename = `${CLIPBOARD_TEMP_PREFIX}${suffix}.png`;
	let bytes: Uint8Array = new Uint8Array();
	const attempt = async (): Promise<string> => {
		const tempPath = deps.join(await deps.ensureDir(), filename);
		await deps.writeFile(tempPath, bytes);
		return tempPath;
	};
	try {
		bytes = image.toPNG();
		try {
			return await attempt();
		} catch (err) {
			if ((err as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT' || !deps.resetDir) throw err;
			deps.resetDir();
			return await attempt();
		}
	} catch (err) {
		console.error('[munkel] failed to save clipboard image to temp file:', err);
		return null;
	}
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
	/** The private per-instance directory every deletable file must live in. */
	rootDir(): string | null;
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
 * 3. The resolved path is inside the resolved private directory
 *    (secondary containment filter — paranoia against a corrupted set
 *    entry).
 *
 * Successfully deleted paths are removed from the set. Unlink errors are
 * logged and swallowed (quit cleanup and the startup sweep are the backstops).
 */
export async function cleanupClipboardTempPaths(
	paths: string[],
	ownedTempPaths: Set<string>,
	deps: CleanupDeps,
): Promise<void> {
	const rootDir = deps.rootDir();
	if (rootDir === null) return;
	const root = deps.resolve(rootDir);
	for (const path of paths) {
		if (!ownedTempPaths.has(path)) continue;
		if (!isClipboardTempPath(path)) continue;
		const resolved = deps.resolve(path);
		if (!resolved.startsWith(root + deps.sep)) continue;
		try {
			await deps.unlink(path);
			ownedTempPaths.delete(path);
		} catch (err) {
			console.warn('[munkel] failed to delete clipboard temp file (quit cleanup / startup sweep will retry):', err);
		}
	}
}

/**
 * FIFO cap on the owned-paths set tracked by `session-handlers.ts` (review
 * INFO): a path only ever leaves that set via a successful send
 * (`cleanupClipboardTempPaths` above) or this eviction, so repeated
 * paste-without-send (attachment removed by hand, or simply never sent)
 * would otherwise grow the set unbounded over a long-running session.
 * Generous relative to any realistic paste-then-abandon rate — this exists
 * purely to bound worst-case memory, not because legitimate usage would
 * ever approach it.
 */
export const MAX_OWNED_CLIPBOARD_TEMP_PATHS = 200;

/**
 * Adds `tempPath` to the owned-paths set, evicting the single oldest entry
 * first if the set is already at `MAX_OWNED_CLIPBOARD_TEMP_PATHS` (`Set`
 * iterates in insertion order, so `values().next()` is the oldest surviving
 * entry — FIFO). Eviction only ever shrinks THIS bookkeeping set; it can
 * never grant deletion authority it didn't already have, and it can never
 * revoke authority over a path that was legitimately deleted. An evicted
 * path simply stops being eligible for `cleanupClipboardTempPaths`' fast
 * post-send delete and falls back to the startup sweep instead (see the
 * lifecycle doc above) — never left un-deletable forever, never made
 * deletable by anything other than this instance having created it.
 */
export function addOwnedClipboardTempPath(ownedTempPaths: Set<string>, tempPath: string): void {
	if (ownedTempPaths.size >= MAX_OWNED_CLIPBOARD_TEMP_PATHS && !ownedTempPaths.has(tempPath)) {
		const oldest = ownedTempPaths.values().next().value;
		if (oldest !== undefined) ownedTempPaths.delete(oldest);
	}
	ownedTempPaths.add(tempPath);
}

export interface QuitCleanupDeps {
	unlinkSync(path: string): void;
	rmdirSync(path: string): void;
	resolve(...parts: string[]): string;
	sep: string;
}

/**
 * Quit-time cleanup (step 4 of the lifecycle). Synchronous so it completes
 * inside the `will-quit` handler. Applies the same three checks as
 * `cleanupClipboardTempPaths` (owned, naming scheme, inside the private
 * directory), then removes the private directory itself (non-recursive: it
 * only succeeds if empty, so nothing foreign is ever swept away). Errors are
 * swallowed; the startup sweep is the backstop.
 */
export function removeOwnedClipboardTempFilesSync(
	ownedTempPaths: Set<string>,
	privateDir: string | null,
	deps: QuitCleanupDeps,
): void {
	if (privateDir === null) return;
	const root = deps.resolve(privateDir);
	for (const path of [...ownedTempPaths]) {
		if (!isClipboardTempPath(path)) continue;
		if (!deps.resolve(path).startsWith(root + deps.sep)) continue;
		try {
			deps.unlinkSync(path);
			ownedTempPaths.delete(path);
		} catch (err) {
			console.warn('[munkel] failed to delete clipboard temp file at quit (startup sweep will retry):', err);
		}
	}
	try {
		deps.rmdirSync(privateDir);
	} catch {
		// Not empty (failed unlink, or an evicted file) or already gone.
	}
}

/** Minimum age before the startup sweep may delete a leftover temp file or
 * private directory. The sweep runs at startup, before this instance has
 * created anything, so everything matching is stale in principle — but
 * another *running* instance (second-instance race during the
 * single-instance-lock window, or a dev build next to a packaged one) keeps
 * its own fresh private directory, and a leftover directory cannot be told
 * apart from a live one by name. The age check is that tell: an active
 * instance's directory and files have a recent mtime. One hour is far beyond
 * any legitimate paste→send window; shortening it would put a second
 * running instance's files at risk, so it is deliberately unchanged. */
export const SWEEP_MIN_AGE_MS = 60 * 60 * 1000;

/**
 * Startup safety net (step 5 of the lifecycle): deletes leftover
 * `munkel-clipboard-*.png` files older than `SWEEP_MIN_AGE_MS` inside
 * real (non-symlink) `munkel-clipboard-dir-*` directories of the tmpdir (and legacy files lying
 * directly in the tmpdir from before the private directory existed), then
 * removes private directories that are themselves older than the minimum
 * age. It never receives renderer input and never recurses further. All
 * errors are swallowed — a failed sweep must never block startup.
 */
export async function sweepClipboardTempFiles(deps: {
	tmpdir(): string;
	join(...parts: string[]): string;
	readdir(path: string): Promise<string[]>;
	stat(path: string): Promise<{ mtimeMs: number }>;
	lstat(path: string): Promise<{ isDirectory(): boolean }>;
	unlink(path: string): Promise<void>;
	rmdir(path: string): Promise<void>;
	/** Wall clock for the age check; injectable for tests. */
	now?(): number;
}): Promise<void> {
	const now = deps.now ?? (() => Date.now());
	const isStale = async (fullPath: string): Promise<boolean> => {
		const { mtimeMs } = await deps.stat(fullPath);
		return now() - mtimeMs >= SWEEP_MIN_AGE_MS;
	};
	let names: string[];
	try {
		names = await deps.readdir(deps.tmpdir());
	} catch {
		return;
	}
	for (const name of names) {
		const fullPath = deps.join(deps.tmpdir(), name);
		try {
			if (isClipboardTempPath(name)) {
				if (await isStale(fullPath)) await deps.unlink(fullPath);
			} else if (name.startsWith(CLIPBOARD_TEMP_DIR_PREFIX) && (await deps.lstat(fullPath)).isDirectory()) {
				await sweepPrivateDir(fullPath);
			}
		} catch {
			// Ignore — e.g. another instance still holds the file, or it
			// vanished between readdir and stat.
		}
	}

	async function sweepPrivateDir(dir: string): Promise<void> {
		const dirWasStale = await isStale(dir);
		for (const fileName of await deps.readdir(dir)) {
			if (!isClipboardTempPath(fileName)) continue;
			const filePath = deps.join(dir, fileName);
			try {
				if (await isStale(filePath)) await deps.unlink(filePath);
			} catch {
				// Ignore — see above.
			}
		}
		if (dirWasStale) await deps.rmdir(dir);
	}
}
