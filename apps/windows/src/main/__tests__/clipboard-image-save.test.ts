import { describe, expect, it } from 'bun:test';
import {
	CLIPBOARD_TEMP_DIR_PREFIX,
	CLIPBOARD_TEMP_PREFIX,
	MAX_CLIPBOARD_PIXELS,
	MAX_OWNED_CLIPBOARD_TEMP_PATHS,
	SWEEP_MIN_AGE_MS,
	addOwnedClipboardTempPath,
	cleanupClipboardTempPaths,
	createClipboardTempDir,
	isClipboardTempPath,
	removeOwnedClipboardTempFilesSync,
	saveClipboardImageToTemp,
	sweepClipboardTempFiles,
	type ClipboardImageLike,
	type CleanupDeps,
} from '../clipboard-image-save';

const PRIVATE_DIR = `/tmp/${CLIPBOARD_TEMP_DIR_PREFIX}abc123`;

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
			ensureDir: () => Promise.resolve(PRIVATE_DIR),
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

		expect(path).toBe(`${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}test.png`);
		expect(writes).toEqual([{ path: `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}test.png`, bytes: 3 }]);
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
			rootDir: () => PRIVATE_DIR,
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
		const owned = new Set([`${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`, `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}2.png`]);

		await cleanupClipboardTempPaths(
			[
				`${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`,
				'/home/x/Pictures/holiday.png', // dialog-picked: must survive
				`${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}2.png`,
			],
			owned,
			deps,
		);

		expect(deleted).toEqual([`${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`, `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}2.png`]);
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

	it('NEVER deletes a path outside the private dir that this instance did not create (other instance/user file)', async () => {
		const { deps, deleted } = mockCleanupDeps();
		// Right directory, right naming scheme — but created by someone else
		// (another running instance): not in the owned set, not deletable.
		await cleanupClipboardTempPaths([`${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}other-instance.png`], new Set<string>(), deps);
		const flatInTmp = `/tmp/${CLIPBOARD_TEMP_PREFIX}flat.png`;
		await cleanupClipboardTempPaths([flatInTmp], new Set([flatInTmp]), deps);

		expect(deleted).toEqual([]);
	});

	it('rejects traversal forms even for owned-set entries (containment belt-and-suspenders)', async () => {
		const { deps, deleted } = mockCleanupDeps();
		// Paranoia case: entries that somehow landed in the owned set but
		// resolve outside the tmpdir must still be refused.
		const traversal = `${PRIVATE_DIR}/../../home/x/${CLIPBOARD_TEMP_PREFIX}evil.png`;
		const foreignAbsolute = `/home/x/${CLIPBOARD_TEMP_PREFIX}evil.png`;
		const owned = new Set([traversal, foreignAbsolute]);

		await cleanupClipboardTempPaths([traversal, foreignAbsolute], owned, deps);

		expect(deleted).toEqual([]);
	});

	it('does nothing when no private dir exists yet', async () => {
		const { deps, deleted } = mockCleanupDeps();
		deps.rootDir = () => null;
		const p = `/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`;

		await cleanupClipboardTempPaths([p], new Set([p]), deps);

		expect(deleted).toEqual([]);
	});

	it('rejects a sibling directory that merely shares the private dir name as a prefix', async () => {
		const { deps, deleted } = mockCleanupDeps();
		const evil = `${PRIVATE_DIR}-evil/${CLIPBOARD_TEMP_PREFIX}foo.png`;

		await cleanupClipboardTempPaths([evil], new Set([evil]), deps);

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
		const first = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`;
		const second = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}2.png`;
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
	const DIR = `${CLIPBOARD_TEMP_DIR_PREFIX}old`;

	function dirMtime(files: Record<string, number>): number {
		const times = Object.values(files);
		return times.length === 0 ? OLD : Math.max(...times);
	}

	function fakeFs(tree: Record<string, Record<string, number> | number>, symlinks: string[] = []) {
		const deleted: string[] = [];
		const removedDirs: string[] = [];
		const deps = {
			tmpdir: () => '/tmp',
			join: (...parts: string[]) => parts.join('/'),
			readdir: (path: string) => {
				if (path === '/tmp') return Promise.resolve(Object.keys(tree));
				const entry = tree[path.slice('/tmp/'.length)];
				if (typeof entry !== 'object') return Promise.reject(new Error('ENOTDIR'));
				return Promise.resolve(Object.keys(entry));
			},
			lstat: (path: string) => {
				const name = path.slice('/tmp/'.length);
				return Promise.resolve({ isDirectory: () => typeof tree[name] === 'object' && !symlinks.includes(name) });
			},
			stat: (path: string) => {
				const parts = path.slice('/tmp/'.length).split('/');
				const top = tree[parts[0]];
				const entry = parts.length === 1 ? top : (top as Record<string, number> | undefined)?.[parts[1]];
				if (entry === undefined) return Promise.reject(new Error('ENOENT'));
				if (typeof entry === 'object') return Promise.resolve({ mtimeMs: dirMtime(entry), isDirectory: () => true });
				return Promise.resolve({ mtimeMs: entry, isDirectory: () => false });
			},
			unlink: (path: string) => {
				deleted.push(path);
				return Promise.resolve();
			},
			rmdir: (path: string) => {
				removedDirs.push(path);
				return Promise.resolve();
			},
			now: () => NOW,
		};
		return { deps, deleted, removedDirs };
	}

	it('deletes only old schema files inside private dirs — never fresh ones (possible live instance)', async () => {
		const { deps, deleted } = fakeFs({
			[DIR]: {
				[`${CLIPBOARD_TEMP_PREFIX}stale.png`]: OLD,
				'unrelated.png': OLD,
				[`${CLIPBOARD_TEMP_PREFIX}fresh.png`]: FRESH,
				[`${CLIPBOARD_TEMP_PREFIX}not-a-png.txt`]: OLD,
			},
			'unrelated.png': OLD,
		});

		await sweepClipboardTempFiles(deps);

		expect(deleted).toEqual([`/tmp/${DIR}/${CLIPBOARD_TEMP_PREFIX}stale.png`]);
	});

	it('only descends into directories with the private-dir prefix', async () => {
		const { deps, deleted } = fakeFs({
			'some-other-dir': { [`${CLIPBOARD_TEMP_PREFIX}x.png`]: OLD },
		});

		await sweepClipboardTempFiles(deps);

		expect(deleted).toEqual([]);
	});

	it('still sweeps old legacy files lying directly in the tmpdir, but not fresh ones', async () => {
		const { deps, deleted } = fakeFs({
			[`${CLIPBOARD_TEMP_PREFIX}legacy-old.png`]: OLD,
			[`${CLIPBOARD_TEMP_PREFIX}legacy-fresh.png`]: FRESH,
			'unrelated.png': OLD,
		});

		await sweepClipboardTempFiles(deps);

		expect(deleted).toEqual([`/tmp/${CLIPBOARD_TEMP_PREFIX}legacy-old.png`]);
	});

	it('removes a private dir only when the dir itself is older than the minimum age', async () => {
		const stale = fakeFs({ [DIR]: { [`${CLIPBOARD_TEMP_PREFIX}a.png`]: OLD } });
		await sweepClipboardTempFiles(stale.deps);
		expect(stale.removedDirs).toEqual([`/tmp/${DIR}`]);

		const live = fakeFs({ [DIR]: { [`${CLIPBOARD_TEMP_PREFIX}a.png`]: FRESH } });
		await sweepClipboardTempFiles(live.deps);
		expect(live.removedDirs).toEqual([]);
	});

	it('never enters a private-dir-named symlink or junction', async () => {
		const { deps, deleted, removedDirs } = fakeFs({ [DIR]: { [`${CLIPBOARD_TEMP_PREFIX}a.png`]: OLD } }, [DIR]);

		await sweepClipboardTempFiles(deps);

		expect(deleted).toEqual([]);
		expect(removedDirs).toEqual([]);
	});

	it('never throws — readdir, stat, unlink and rmdir failures are swallowed', async () => {
		await expect(
			sweepClipboardTempFiles({
				tmpdir: () => '/tmp',
				join: (...parts) => parts.join('/'),
				readdir: () => Promise.reject(new Error('EACCES')),
				lstat: () => Promise.reject(new Error('ENOENT')),
				stat: () => Promise.reject(new Error('ENOENT')),
				unlink: () => Promise.reject(new Error('locked')),
				rmdir: () => Promise.reject(new Error('busy')),
			}),
		).resolves.toBeUndefined();

		await expect(
			sweepClipboardTempFiles({
				tmpdir: () => '/tmp',
				join: (...parts) => parts.join('/'),
				readdir: (path) => Promise.resolve(path === '/tmp' ? [DIR] : [`${CLIPBOARD_TEMP_PREFIX}x.png`]),
				lstat: () => Promise.resolve({ isDirectory: () => true }),
				stat: () => Promise.resolve({ mtimeMs: 0 }),
				unlink: () => Promise.reject(new Error('locked')),
				rmdir: () => Promise.reject(new Error('busy')),
			}),
		).resolves.toBeUndefined();
	});
});

describe('createClipboardTempDir (private subdirectory)', () => {
	it('creates one mkdtemp dir under the tmpdir with the dir prefix and reuses it', async () => {
		const prefixes: string[] = [];
		const dir = createClipboardTempDir({
			tmpdir: () => '/tmp',
			join: (...parts) => parts.join('/'),
			mkdtemp: (prefix) => {
				prefixes.push(prefix);
				return Promise.resolve(`${prefix}Xyz`);
			},
		});

		expect(dir.current()).toBeNull();
		const first = await dir.ensure();
		const second = await dir.ensure();

		expect(first).toBe(`/tmp/${CLIPBOARD_TEMP_DIR_PREFIX}Xyz`);
		expect(second).toBe(first);
		expect(prefixes).toEqual([`/tmp/${CLIPBOARD_TEMP_DIR_PREFIX}`]);
		expect(dir.current()).toBe(first);
	});

	it('shares one mkdtemp across parallel ensure calls', async () => {
		let calls = 0;
		const dir = createClipboardTempDir({
			tmpdir: () => '/tmp',
			join: (...parts) => parts.join('/'),
			mkdtemp: (prefix) => {
				calls++;
				return Promise.resolve(`${prefix}shared`);
			},
		});

		const results = await Promise.all([dir.ensure(), dir.ensure(), dir.ensure()]);

		expect(calls).toBe(1);
		expect(new Set(results).size).toBe(1);
	});

	it('reset drops the cached dir so the next ensure creates a new one', async () => {
		let calls = 0;
		const dir = createClipboardTempDir({
			tmpdir: () => '/tmp',
			join: (...parts) => parts.join('/'),
			mkdtemp: (prefix) => Promise.resolve(`${prefix}${++calls}`),
		});

		const first = await dir.ensure();
		dir.reset();

		expect(dir.current()).toBeNull();
		expect(await dir.ensure()).not.toBe(first);
	});

	it('does not cache a failed creation', async () => {
		let calls = 0;
		const dir = createClipboardTempDir({
			tmpdir: () => '/tmp',
			join: (...parts) => parts.join('/'),
			mkdtemp: (prefix) => {
				calls++;
				return calls === 1 ? Promise.reject(new Error('EACCES')) : Promise.resolve(`${prefix}ok`);
			},
		});

		await expect(dir.ensure()).rejects.toThrow('EACCES');
		expect(dir.current()).toBeNull();
		expect(await dir.ensure()).toBe(`/tmp/${CLIPBOARD_TEMP_DIR_PREFIX}ok`);
	});
});

describe('saveClipboardImageToTemp when the private dir vanished (swept by another instance)', () => {
	function enoent(): Error {
		return Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
	}

	it('drops the cached dir, recreates it once and retries the write once', async () => {
		const { deps, writes } = mockDeps();
		let ensureCalls = 0;
		let resets = 0;
		let attempts = 0;
		deps.ensureDir = () => {
			ensureCalls++;
			return Promise.resolve(ensureCalls === 1 ? PRIVATE_DIR : `${PRIVATE_DIR}-2`);
		};
		deps.resetDir = () => {
			resets++;
		};
		const realWrite = deps.writeFile;
		deps.writeFile = (path, data) => (++attempts === 1 ? Promise.reject(enoent()) : realWrite(path, data));

		const path = await saveClipboardImageToTemp(mockImage(), deps);

		expect(path).toBe(`${PRIVATE_DIR}-2/${CLIPBOARD_TEMP_PREFIX}test.png`);
		expect(resets).toBe(1);
		expect(ensureCalls).toBe(2);
		expect(writes.length).toBe(1);
	});

	it('gives up with null after a second ENOENT', async () => {
		const { deps } = mockDeps();
		let attempts = 0;
		deps.resetDir = () => {};
		deps.writeFile = () => {
			attempts++;
			return Promise.reject(enoent());
		};

		expect(await saveClipboardImageToTemp(mockImage(), deps)).toBeNull();
		expect(attempts).toBe(2);
	});

	it('does not retry for other write errors', async () => {
		const { deps } = mockDeps();
		let attempts = 0;
		deps.resetDir = () => {};
		deps.writeFile = () => {
			attempts++;
			return Promise.reject(Object.assign(new Error('full'), { code: 'ENOSPC' }));
		};

		expect(await saveClipboardImageToTemp(mockImage(), deps)).toBeNull();
		expect(attempts).toBe(1);
	});
});

describe('saveClipboardImageToTemp with a failing private dir', () => {
	it('returns null instead of falling back to the shared tmpdir', async () => {
		const { deps, writes } = mockDeps();
		deps.ensureDir = () => Promise.reject(new Error('EACCES'));

		expect(await saveClipboardImageToTemp(mockImage(), deps)).toBeNull();
		expect(writes).toEqual([]);
	});
});

describe('removeOwnedClipboardTempFilesSync (app quit)', () => {
	function quitDeps() {
		const deleted: string[] = [];
		const removedDirs: string[] = [];
		return {
			deleted,
			removedDirs,
			deps: {
				unlinkSync: (path: string) => {
					deleted.push(path);
				},
				rmdirSync: (path: string) => {
					removedDirs.push(path);
				},
				resolve: (...parts: string[]) => parts.join('/'),
				sep: '/',
			},
		};
	}

	it('deletes every owned file inside the private dir, empties the set, then removes the dir', () => {
		const { deps, deleted, removedDirs } = quitDeps();
		const a = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`;
		const b = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}2.png`;
		const owned = new Set([a, b]);

		removeOwnedClipboardTempFilesSync(owned, PRIVATE_DIR, deps);

		expect(deleted).toEqual([a, b]);
		expect(owned.size).toBe(0);
		expect(removedDirs).toEqual([PRIVATE_DIR]);
	});

	it('never deletes owned-set entries outside the private dir or off the naming scheme', () => {
		const { deps, deleted } = quitDeps();
		const outside = `/home/x/${CLIPBOARD_TEMP_PREFIX}evil.png`;
		const flat = `/tmp/${CLIPBOARD_TEMP_PREFIX}flat.png`;
		const wrongName = `${PRIVATE_DIR}/other.png`;

		removeOwnedClipboardTempFilesSync(new Set([outside, flat, wrongName]), PRIVATE_DIR, deps);

		expect(deleted).toEqual([]);
	});

	it('rejects a sibling directory that merely shares the private dir name as a prefix', () => {
		const { deps, deleted } = quitDeps();
		const evil = `${PRIVATE_DIR}-evil/${CLIPBOARD_TEMP_PREFIX}foo.png`;

		removeOwnedClipboardTempFilesSync(new Set([evil]), PRIVATE_DIR, deps);

		expect(deleted).toEqual([]);
	});

	it('is idempotent when called twice', () => {
		const { deps, deleted } = quitDeps();
		const a = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`;
		const owned = new Set([a]);

		removeOwnedClipboardTempFilesSync(owned, PRIVATE_DIR, deps);
		expect(() => removeOwnedClipboardTempFilesSync(owned, PRIVATE_DIR, deps)).not.toThrow();

		expect(deleted).toEqual([a]);
	});

	it('does nothing when no private dir was ever created', () => {
		const { deps, deleted, removedDirs } = quitDeps();

		removeOwnedClipboardTempFilesSync(new Set([`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`]), null, deps);

		expect(deleted).toEqual([]);
		expect(removedDirs).toEqual([]);
	});

	it('never throws on unlink/rmdir errors and keeps going', () => {
		const { deps, deleted } = quitDeps();
		const a = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}1.png`;
		const b = `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}2.png`;
		deps.unlinkSync = (path: string) => {
			if (path === a) throw new Error('locked');
			deleted.push(path);
		};
		deps.rmdirSync = () => {
			throw new Error('not empty');
		};

		expect(() => removeOwnedClipboardTempFilesSync(new Set([a, b]), PRIVATE_DIR, deps)).not.toThrow();
		expect(deleted).toEqual([b]);
	});
});

describe('addOwnedClipboardTempPath (Iteration-7 review INFO: bounded owned-paths set)', () => {
	function pathN(n: number): string {
		return `${PRIVATE_DIR}/${CLIPBOARD_TEMP_PREFIX}${n}.png`;
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
