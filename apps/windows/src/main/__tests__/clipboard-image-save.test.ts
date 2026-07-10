import { describe, expect, it } from 'bun:test';
import {
	CLIPBOARD_TEMP_PREFIX,
	MAX_CLIPBOARD_PIXELS,
	MAX_OWNED_CLIPBOARD_TEMP_PATHS,
	SWEEP_MIN_AGE_MS,
	addOwnedClipboardTempPath,
	cleanupClipboardTempPaths,
	isClipboardTempPath,
	saveClipboardImageToTemp,
	sweepClipboardTempFiles,
	type ClipboardImageLike,
	type CleanupDeps,
} from '../clipboard-image-save';

function mockImage(overrides: Partial<ClipboardImageLike> = {}): ClipboardImageLike {
	return {
		isEmpty: () => false,
		getSize: () => ({ width: 800, height: 600 }),
		toPNG: () => new Uint8Array([1, 2, 3]),
		...overrides,
	};
}

function mockDeps() {
	const writes: Array<{ path: string; bytes: number }> = [];
	return {
		writes,
		deps: {
			tmpdir: () => '/tmp',
			join: (...parts: string[]) => parts.join('/'),
			writeFile: (path: string, data: Uint8Array) => {
				writes.push({ path, bytes: data.byteLength });
				return Promise.resolve();
			},
			uniqueSuffix: () => 'test',
		},
	};
}

describe('saveClipboardImageToTemp (Plan 12 P3.4 hardening)', () => {
	it('writes the PNG to a prefixed temp file and returns its path', async () => {
		const { deps, writes } = mockDeps();

		const path = await saveClipboardImageToTemp(mockImage(), deps);

		expect(path).toBe(`/tmp/${CLIPBOARD_TEMP_PREFIX}test.png`);
		expect(writes).toEqual([{ path: `/tmp/${CLIPBOARD_TEMP_PREFIX}test.png`, bytes: 3 }]);
	});

	it('returns null for an empty clipboard without touching toPNG or the disk', async () => {
		const { deps, writes } = mockDeps();
		let encoded = false;
		const image = mockImage({
			isEmpty: () => true,
			toPNG: () => {
				encoded = true;
				return new Uint8Array();
			},
		});

		expect(await saveClipboardImageToTemp(image, deps)).toBeNull();
		expect(encoded).toBe(false);
		expect(writes).toEqual([]);
	});

	it('rejects an image over MAX_CLIPBOARD_PIXELS BEFORE encoding or writing', async () => {
		const { deps, writes } = mockDeps();
		let encoded = false;
		const image = mockImage({
			// One pixel over the cap.
			getSize: () => ({ width: MAX_CLIPBOARD_PIXELS + 1, height: 1 }),
			toPNG: () => {
				encoded = true;
				return new Uint8Array();
			},
		});

		expect(await saveClipboardImageToTemp(image, deps)).toBeNull();
		expect(encoded).toBe(false); // the expensive encode never ran
		expect(writes).toEqual([]);
	});

	it('accepts an image exactly at the pixel cap', async () => {
		const { deps } = mockDeps();
		const image = mockImage({ getSize: () => ({ width: MAX_CLIPBOARD_PIXELS, height: 1 }) });

		expect(await saveClipboardImageToTemp(image, deps)).not.toBeNull();
	});

	it('rejects degenerate zero/negative dimensions', async () => {
		const { deps } = mockDeps();
		expect(await saveClipboardImageToTemp(mockImage({ getSize: () => ({ width: 0, height: 100 }) }), deps)).toBeNull();
		expect(await saveClipboardImageToTemp(mockImage({ getSize: () => ({ width: 100, height: -1 }) }), deps)).toBeNull();
	});

	it('rejects NaN/Infinity dimensions (NaN comparisons would sail past a bare threshold)', async () => {
		const { deps, writes } = mockDeps();
		expect(await saveClipboardImageToTemp(mockImage({ getSize: () => ({ width: NaN, height: NaN }) }), deps)).toBeNull();
		expect(await saveClipboardImageToTemp(mockImage({ getSize: () => ({ width: 100, height: NaN }) }), deps)).toBeNull();
		expect(
			await saveClipboardImageToTemp(mockImage({ getSize: () => ({ width: Infinity, height: 1 }) }), deps),
		).toBeNull();
		expect(writes).toEqual([]);
	});

	it('returns null (not a throw) when the temp-file write fails', async () => {
		const { deps } = mockDeps();
		deps.writeFile = () => Promise.reject(new Error('disk full'));

		expect(await saveClipboardImageToTemp(mockImage(), deps)).toBeNull();
	});
});

describe('isClipboardTempPath', () => {
	it('matches this module\'s temp files regardless of directory spelling', () => {
		expect(isClipboardTempPath(`/tmp/${CLIPBOARD_TEMP_PREFIX}abc.png`)).toBe(true);
		expect(isClipboardTempPath(`C:\\Users\\x\\AppData\\Local\\Temp\\${CLIPBOARD_TEMP_PREFIX}abc.png`)).toBe(true);
	});

	it('never matches user-picked files', () => {
		expect(isClipboardTempPath('C:\\Users\\x\\Pictures\\holiday.png')).toBe(false);
		expect(isClipboardTempPath(`/tmp/${CLIPBOARD_TEMP_PREFIX}abc.jpg`)).toBe(false); // wrong extension
		expect(isClipboardTempPath('/tmp/other-prefix-abc.png')).toBe(false);
	});
});

function mockCleanupDeps(): { deleted: string[]; deps: CleanupDeps } {
	const deleted: string[] = [];
	return {
		deleted,
		deps: {
			unlink: (path) => {
				deleted.push(path);
				return Promise.resolve();
			},
			tmpdir: () => '/tmp',
			// POSIX-ish resolve for tests: leaves absolute paths alone but
			// collapses `.` / `..` segments, mirroring what node's resolve
			// does for the containment check.
			resolve: (...parts: string[]) => {
				const joined = parts.join('/');
				const out: string[] = [];
				for (const seg of joined.split('/')) {
					if (seg === '' || seg === '.') continue;
					if (seg === '..') out.pop();
					else out.push(seg);
				}
				return '/' + out.join('/');
			},
			sep: '/',
		},
	};
}

describe('cleanupClipboardTempPaths (post-successful-send, review MAJOR Datei-Lösch-Primitiv)', () => {
	it('deletes only owned clipboard temp files among the sent paths', async () => {
		const { deps, deleted } = mockCleanupDeps();
		const owned = new Set([`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`, `/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`]);

		await cleanupClipboardTempPaths(
			[
				`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`,
				'/home/x/Pictures/holiday.png', // dialog-picked: must survive
				`/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`,
			],
			owned,
			deps,
		);

		expect(deleted).toEqual([`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`, `/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`]);
		expect(owned.size).toBe(0); // deleted paths leave the owned set
	});

	it('NEVER deletes a foreign path with a matching basename that this instance did not create', async () => {
		const { deps, deleted } = mockCleanupDeps();
		// Attack from the review: the renderer passes a user file it renamed
		// (or that legitimately exists) to match the temp-file naming scheme.
		const evidence = `/home/x/Documents/${CLIPBOARD_TEMP_PREFIX}evidence.png`;

		await cleanupClipboardTempPaths([evidence], new Set<string>(), deps);

		expect(deleted).toEqual([]);
	});

	it('NEVER deletes a path in the tmpdir that this instance did not create (other instance/user file)', async () => {
		const { deps, deleted } = mockCleanupDeps();
		// Right directory, right naming scheme — but created by someone else
		// (another running instance): not in the owned set, not deletable.
		await cleanupClipboardTempPaths([`/tmp/${CLIPBOARD_TEMP_PREFIX}other-instance.png`], new Set<string>(), deps);

		expect(deleted).toEqual([]);
	});

	it('rejects traversal forms even for owned-set entries (containment belt-and-suspenders)', async () => {
		const { deps, deleted } = mockCleanupDeps();
		// Paranoia case: entries that somehow landed in the owned set but
		// resolve outside the tmpdir must still be refused.
		const traversal = `/tmp/../home/x/${CLIPBOARD_TEMP_PREFIX}evil.png`;
		const foreignAbsolute = `/home/x/${CLIPBOARD_TEMP_PREFIX}evil.png`;
		const owned = new Set([traversal, foreignAbsolute]);

		await cleanupClipboardTempPaths([traversal, foreignAbsolute], owned, deps);

		expect(deleted).toEqual([]);
	});

	it('rejects owned-set entries whose basename does not match the naming scheme', async () => {
		const { deps, deleted } = mockCleanupDeps();
		const weird = '/tmp/some-other-file.png';
		await cleanupClipboardTempPaths([weird], new Set([weird]), deps);

		expect(deleted).toEqual([]);
	});

	it('swallows unlink errors, keeps the path owned, and continues with the remaining files', async () => {
		const { deps, deleted } = mockCleanupDeps();
		const first = `/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`;
		const second = `/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`;
		const owned = new Set([first, second]);
		deps.unlink = (path) => {
			if (path === first) return Promise.reject(new Error('locked'));
			deleted.push(path);
			return Promise.resolve();
		};

		await cleanupClipboardTempPaths([first, second], owned, deps);

		expect(deleted).toEqual([second]);
		expect(owned.has(first)).toBe(true); // failed delete stays owned
		expect(owned.has(second)).toBe(false);
	});
});

describe('sweepClipboardTempFiles (startup safety net)', () => {
	const NOW = 10_000_000_000;
	const OLD = NOW - SWEEP_MIN_AGE_MS - 1;
	const FRESH = NOW - 1_000;

	function sweepDeps(files: Record<string, number>, deleted: string[]) {
		return {
			tmpdir: () => '/tmp',
			join: (...parts: string[]) => parts.join('/'),
			readdir: () => Promise.resolve(Object.keys(files)),
			stat: (path: string) => {
				const name = path.split('/').pop() ?? '';
				if (!(name in files)) return Promise.reject(new Error('ENOENT'));
				return Promise.resolve({ mtimeMs: files[name] });
			},
			unlink: (path: string) => {
				deleted.push(path);
				return Promise.resolve();
			},
			now: () => NOW,
		};
	}

	it('deletes only old munkel-clipboard-*.png files — never fresh ones (possible live instance)', async () => {
		const deleted: string[] = [];
		await sweepClipboardTempFiles(
			sweepDeps(
				{
					[`${CLIPBOARD_TEMP_PREFIX}stale.png`]: OLD,
					'unrelated.png': OLD,
					[`${CLIPBOARD_TEMP_PREFIX}fresh.png`]: FRESH,
					[`${CLIPBOARD_TEMP_PREFIX}stale2.png`]: OLD,
					[`${CLIPBOARD_TEMP_PREFIX}not-a-png.txt`]: OLD,
				},
				deleted,
			),
		);

		expect(deleted).toEqual([
			`/tmp/${CLIPBOARD_TEMP_PREFIX}stale.png`,
			`/tmp/${CLIPBOARD_TEMP_PREFIX}stale2.png`,
		]);
	});

	it('never throws — readdir, stat, and unlink failures are swallowed', async () => {
		await expect(
			sweepClipboardTempFiles({
				tmpdir: () => '/tmp',
				join: (...parts) => parts.join('/'),
				readdir: () => Promise.reject(new Error('EACCES')),
				stat: () => Promise.reject(new Error('ENOENT')),
				unlink: () => Promise.reject(new Error('locked')),
			}),
		).resolves.toBeUndefined();

		await expect(
			sweepClipboardTempFiles({
				tmpdir: () => '/tmp',
				join: (...parts) => parts.join('/'),
				readdir: () => Promise.resolve([`${CLIPBOARD_TEMP_PREFIX}x.png`]),
				stat: () => Promise.resolve({ mtimeMs: 0 }),
				unlink: () => Promise.reject(new Error('locked')),
			}),
		).resolves.toBeUndefined();
	});
});

describe('addOwnedClipboardTempPath (Iteration-7 review INFO: bounded owned-paths set)', () => {
	function pathN(n: number): string {
		return `/tmp/${CLIPBOARD_TEMP_PREFIX}${n}.png`;
	}

	it('adds paths normally while under the cap', () => {
		const owned = new Set<string>();
		addOwnedClipboardTempPath(owned, pathN(1));
		addOwnedClipboardTempPath(owned, pathN(2));

		expect([...owned]).toEqual([pathN(1), pathN(2)]);
	});

	it('evicts the single oldest entry (FIFO) once the cap is reached', () => {
		const owned = new Set<string>();
		for (let i = 0; i < MAX_OWNED_CLIPBOARD_TEMP_PATHS; i++) {
			addOwnedClipboardTempPath(owned, pathN(i));
		}
		expect(owned.size).toBe(MAX_OWNED_CLIPBOARD_TEMP_PATHS);
		expect(owned.has(pathN(0))).toBe(true);

		// One more add past the cap must evict exactly the oldest (index 0),
		// keeping every other previously-added path intact.
		addOwnedClipboardTempPath(owned, pathN(MAX_OWNED_CLIPBOARD_TEMP_PATHS));

		expect(owned.size).toBe(MAX_OWNED_CLIPBOARD_TEMP_PATHS);
		expect(owned.has(pathN(0))).toBe(false);
		expect(owned.has(pathN(1))).toBe(true);
		expect(owned.has(pathN(MAX_OWNED_CLIPBOARD_TEMP_PATHS))).toBe(true);
	});

	it('never grows the set past the cap across many more adds than the cap', () => {
		const owned = new Set<string>();
		const total = MAX_OWNED_CLIPBOARD_TEMP_PATHS * 3;
		for (let i = 0; i < total; i++) {
			addOwnedClipboardTempPath(owned, pathN(i));
		}

		expect(owned.size).toBe(MAX_OWNED_CLIPBOARD_TEMP_PATHS);
		// Only the most recent MAX_OWNED_CLIPBOARD_TEMP_PATHS paths survive.
		for (let i = total - MAX_OWNED_CLIPBOARD_TEMP_PATHS; i < total; i++) {
			expect(owned.has(pathN(i))).toBe(true);
		}
		expect(owned.has(pathN(0))).toBe(false);
	});

	it('re-adding an already-owned path is a no-op that does not evict anything', () => {
		const owned = new Set<string>();
		for (let i = 0; i < MAX_OWNED_CLIPBOARD_TEMP_PATHS; i++) {
			addOwnedClipboardTempPath(owned, pathN(i));
		}

		addOwnedClipboardTempPath(owned, pathN(0)); // already present, at the cap

		expect(owned.size).toBe(MAX_OWNED_CLIPBOARD_TEMP_PATHS);
		expect(owned.has(pathN(0))).toBe(true);
		expect(owned.has(pathN(1))).toBe(true); // nothing else was evicted
	});

	it('eviction never revokes deletion authority a real successful send already exercised', async () => {
		// End-to-end sanity: cap eviction plus a later legitimate cleanup must
		// never combine into deleting a path this instance did not create, and
		// a path that was actually sent and cleaned up leaves the set exactly
		// like an eviction would — the deletion-authority invariant
		// (cleanupClipboardTempPaths' own tests above) is unaffected by this
		// bounded-growth change.
		const owned = new Set<string>();
		addOwnedClipboardTempPath(owned, pathN(1));
		addOwnedClipboardTempPath(owned, pathN(2));

		const { deps, deleted } = mockCleanupDeps();
		await cleanupClipboardTempPaths([pathN(1)], owned, deps);

		expect(deleted).toEqual([pathN(1)]);
		expect(owned.has(pathN(1))).toBe(false);
		expect(owned.has(pathN(2))).toBe(true);
	});
});
