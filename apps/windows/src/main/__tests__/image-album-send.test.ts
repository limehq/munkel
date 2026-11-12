import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as core from '../../core';
import { MAX_SOURCE_BYTES } from '../../core';
import { fileTooLargeReason } from '../../shared/send-result';
import { prepareImageAlbum, READ_CONCURRENCY, ReadLimiter } from '../image-album-send';

const installedStubs: Array<{ mockRestore(): void }> = [];

function stubCoreForAlbum(): void {
	installedStubs.push(
		spyOn(core, 'isSourceSafe').mockImplementation(() => true),
		spyOn(core.imageCodec, 'prepareFull').mockImplementation(async () => ({
			data: new Uint8Array(8),
			width: 1,
			height: 1,
		})),
		spyOn(core.imageCodec, 'makeThumbnail').mockImplementation(async () => ({ data: new Uint8Array(8) })),
		spyOn(core, 'sealRaw').mockImplementation(async () => new Uint8Array(8)),
		spyOn(core, 'uploadBlob').mockImplementation(async () => ({ ok: true as const })),
		spyOn(core, 'generateBlobKey').mockImplementation(() => 'a'.repeat(16)),
	);
}

function restoreCoreStubs(): void {
	while (installedStubs.length > 0) {
		installedStubs.pop()?.mockRestore();
	}
}

async function testMessageKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

describe('ReadLimiter', () => {
	it(`caps concurrent acquisitions at ${READ_CONCURRENCY}`, async () => {
		const limiter = new ReadLimiter(READ_CONCURRENCY);
		let active = 0;
		let maxActive = 0;

		await Promise.all(
			Array.from({ length: 4 }, () =>
				(async () => {
					await limiter.acquire();
					active++;
					maxActive = Math.max(maxActive, active);
					await Promise.resolve();
					active--;
					limiter.release();
				})(),
			),
		);

		expect(maxActive).toBe(READ_CONCURRENCY);
	});
});

describe('prepareImageAlbum', () => {
	beforeEach(() => {
		stubCoreForAlbum();
	});

	afterEach(() => {
		restoreCoreStubs();
	});

	it('rejects oversized files from stat without reading them', async () => {
		const readFile = mock(async () => {
			throw new Error('readFile must not be called for oversized files');
		});
		const stat = mock(async (path: string) => ({
			isFile: () => true,
			size: MAX_SOURCE_BYTES + 1,
			path,
		}));

		const { items, skipped } = await prepareImageAlbum(
			['C:/album/huge.png'],
			await testMessageKey(),
			'ws://relay.invalid/ws',
			'group-id',
			{ stat, readFile },
		);

		expect(items).toHaveLength(0);
		expect(skipped).toEqual([
			{
				path: 'C:/album/huge.png',
				reason: fileTooLargeReason('C:/album/huge.png', MAX_SOURCE_BYTES + 1, MAX_SOURCE_BYTES),
			},
		]);
		expect(readFile).not.toHaveBeenCalled();
	});

	it('preserves input order for surviving items and skipped entries', async () => {
		const readFile = mock(async (path: string) => Buffer.from(`payload-${path}`));
		const stat = mock(async (path: string) => ({
			isFile: () => true,
			size: path.includes('skip') ? MAX_SOURCE_BYTES + 1 : 128,
			path,
		}));

		const { items, skipped } = await prepareImageAlbum(
			['first.png', 'skip.png', 'third.png'],
			await testMessageKey(),
			'ws://relay.invalid/ws',
			'group-id',
			{ stat, readFile },
		);

		expect(skipped.map((s) => s.path)).toEqual(['skip.png']);
		expect(readFile.mock.calls.map((call) => call[0])).toEqual(['first.png', 'third.png']);
		expect(items).toHaveLength(2);
	});
});
