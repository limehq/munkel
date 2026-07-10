import { describe, expect, it } from 'bun:test';
import {
	CLIPBOARD_TEMP_PREFIX,
	MAX_CLIPBOARD_PIXELS,
	cleanupClipboardTempPaths,
	isClipboardTempPath,
	saveClipboardImageToTemp,
	sweepClipboardTempFiles,
	type ClipboardImageLike,
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

describe('cleanupClipboardTempPaths (post-successful-send)', () => {
	it('deletes only the clipboard temp files among the sent paths', async () => {
		const deleted: string[] = [];
		await cleanupClipboardTempPaths(
			[
				`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`,
				'C:\\Users\\x\\Pictures\\holiday.png', // dialog-picked: must survive
				`/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`,
			],
			(path) => {
				deleted.push(path);
				return Promise.resolve();
			},
		);

		expect(deleted).toEqual([`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`, `/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`]);
	});

	it('swallows unlink errors and continues with the remaining files', async () => {
		const deleted: string[] = [];
		await cleanupClipboardTempPaths(
			[`/tmp/${CLIPBOARD_TEMP_PREFIX}1.png`, `/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`],
			(path) => {
				if (path.endsWith('1.png')) return Promise.reject(new Error('locked'));
				deleted.push(path);
				return Promise.resolve();
			},
		);

		expect(deleted).toEqual([`/tmp/${CLIPBOARD_TEMP_PREFIX}2.png`]);
	});
});

describe('sweepClipboardTempFiles (startup safety net)', () => {
	it('deletes leftover munkel-clipboard-*.png files and nothing else', async () => {
		const deleted: string[] = [];
		await sweepClipboardTempFiles({
			tmpdir: () => '/tmp',
			join: (...parts) => parts.join('/'),
			readdir: () =>
				Promise.resolve([
					`${CLIPBOARD_TEMP_PREFIX}stale.png`,
					'unrelated.png',
					`${CLIPBOARD_TEMP_PREFIX}stale2.png`,
					`${CLIPBOARD_TEMP_PREFIX}not-a-png.txt`,
				]),
			unlink: (path) => {
				deleted.push(path);
				return Promise.resolve();
			},
		});

		expect(deleted).toEqual([
			`/tmp/${CLIPBOARD_TEMP_PREFIX}stale.png`,
			`/tmp/${CLIPBOARD_TEMP_PREFIX}stale2.png`,
		]);
	});

	it('never throws — readdir and unlink failures are swallowed', async () => {
		await expect(
			sweepClipboardTempFiles({
				tmpdir: () => '/tmp',
				join: (...parts) => parts.join('/'),
				readdir: () => Promise.reject(new Error('EACCES')),
				unlink: () => Promise.reject(new Error('locked')),
			}),
		).resolves.toBeUndefined();

		await expect(
			sweepClipboardTempFiles({
				tmpdir: () => '/tmp',
				join: (...parts) => parts.join('/'),
				readdir: () => Promise.resolve([`${CLIPBOARD_TEMP_PREFIX}x.png`]),
				unlink: () => Promise.reject(new Error('locked')),
			}),
		).resolves.toBeUndefined();
	});
});
