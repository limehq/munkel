import { stat, readFile } from 'node:fs/promises';
import {
	imageCodec,
	isSourceSafe,
	MAX_SOURCE_BYTES,
	perThumbBudget,
	sealRaw,
	uploadBlob,
	generateBlobKey,
} from '../core';
import type { ImageItem } from '../core';
import { fileTooLargeReason, type SkippedImage } from '../shared/send-result';

export const READ_CONCURRENCY = 2;

export type ImageAlbumSendDeps = {
	stat: typeof stat;
	readFile: typeof readFile;
};

type PreparedSlot =
	| { index: number; item: ImageItem }
	| { index: number; skip: SkippedImage };

export class ReadLimiter {
	private active = 0;
	private readonly queue: Array<() => void> = [];

	constructor(private readonly limit: number) {}

	async acquire(): Promise<void> {
		if (this.active < this.limit) {
			this.active++;
			return;
		}
		await new Promise<void>((resolve) => {
			this.queue.push(resolve);
		});
		this.active++;
	}

	release(): void {
		this.active--;
		const next = this.queue.shift();
		if (next) next();
	}
}

async function prepareOneImage(
	path: string,
	index: number,
	perThumb: number,
	messageKey: CryptoKey,
	relayUrl: string,
	groupId: string,
	deps: ImageAlbumSendDeps,
	readLimiter: ReadLimiter,
): Promise<PreparedSlot> {
	let fileStat;
	try {
		fileStat = await deps.stat(path);
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'ENOENT') {
			return { index, skip: { path, reason: `File not found: ${path}` } };
		}
		return {
			index,
			skip: {
				path,
				reason: `Could not access ${path}: ${err instanceof Error ? err.message : String(err)}`,
			},
		};
	}

	if (!fileStat.isFile()) {
		return { index, skip: { path, reason: `Not a file: ${path}` } };
	}

	if (fileStat.size > MAX_SOURCE_BYTES) {
		return {
			index,
			skip: { path, reason: fileTooLargeReason(path, fileStat.size, MAX_SOURCE_BYTES) },
		};
	}

	await readLimiter.acquire();
	let source: Uint8Array;
	try {
		source = new Uint8Array(await deps.readFile(path));
	} catch (err) {
		return {
			index,
			skip: {
				path,
				reason: `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}`,
			},
		};
	} finally {
		readLimiter.release();
	}

	if (source.byteLength > MAX_SOURCE_BYTES) {
		return {
			index,
			skip: { path, reason: fileTooLargeReason(path, source.byteLength, MAX_SOURCE_BYTES) },
		};
	}

	if (!isSourceSafe(source)) {
		return { index, skip: { path, reason: `Could not encode ${path}` } };
	}

	const full = await imageCodec.prepareFull(source);
	if (!full) {
		return { index, skip: { path, reason: `Could not encode ${path}` } };
	}

	const sealedFull = await sealRaw(full.data, messageKey);
	const r2Key = generateBlobKey();
	const upload = await uploadBlob(relayUrl, groupId, r2Key, sealedFull);
	if (!upload.ok) {
		return { index, skip: { path, reason: upload.error ?? 'Blob upload failed' } };
	}

	const thumb = await imageCodec.makeThumbnail(source, perThumb);
	if (!thumb) {
		return { index, skip: { path, reason: `Could not thumbnail ${path}` } };
	}

	return {
		index,
		item: {
			r2Key,
			mime: 'image/avif',
			width: full.width,
			height: full.height,
			byteLen: sealedFull.byteLength,
			thumb: Buffer.from(thumb.data).toString('base64'),
		},
	};
}

export async function prepareImageAlbum(
	imagePaths: string[],
	messageKey: CryptoKey,
	relayUrl: string,
	groupId: string,
	deps: ImageAlbumSendDeps = { stat, readFile },
): Promise<{ items: ImageItem[]; skipped: SkippedImage[] }> {
	const perThumb = perThumbBudget(imagePaths.length);
	const readLimiter = new ReadLimiter(READ_CONCURRENCY);

	const slots = await Promise.all(
		imagePaths.map((path, index) =>
			prepareOneImage(path, index, perThumb, messageKey, relayUrl, groupId, deps, readLimiter),
		),
	);

	const skipped: SkippedImage[] = [];
	const items: ImageItem[] = [];
	for (const slot of slots.sort((a, b) => a.index - b.index)) {
		if ('skip' in slot) {
			skipped.push(slot.skip);
		} else {
			items.push(slot.item);
		}
	}

	return { items, skipped };
}
