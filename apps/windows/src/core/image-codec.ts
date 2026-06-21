/**
 * Image codec — mirrors `apps/macos/Sources/MunkelKit/ImageCodec.swift`
 * byte-for-byte so Windows and macOS produce the same AVIF on the wire.
 *
 * Three operations:
 *
 * - `prepareFull(source)` — downsample + AVIF-transcode the input to fit
 *   `MAX_FULL_BYTES` (2 MiB) at quality steps `[0.7, 0.5, 0.35]`.
 * - `makeThumbnail(source, budgetBytes)` — same pipeline at smaller
 *   `MAX_THUMB_PIXELS` (256 px) and tighter quality `[0.6, 0.45, 0.3]`.
 * - `probe(source)` — header-only pixel/dimension inspection (no decode).
 *
 * AVIF encoding goes through `@jsquash/avif` (WASM libavif, no native
 * build). Source decoding goes through the browser `createImageBitmap`
 * + `OffscreenCanvas` path, which works in both the Electron renderer
 * and the Bun main process (Bun supports `OffscreenCanvas` since 1.0.12).
 *
 * Drift vs `ImageCodec.swift` is a silent wire-format bug. The byte
 * budgets, pixel caps, and step orderings here are pinned to the Swift
 * source — a parity test lands on the `swift-windows-interop` follow-up
 * branch.
 */

import encodeAvifInit, { init as initAvifEncode } from '@jsquash/avif/encode';
import decodeAvifInit, { init as initAvifDecode } from '@jsquash/avif/decode';
import imageSize from 'image-size';

// Mirrors MunkelKit/ImageCodec.swift
export const MAX_FULL_BYTES = 2 * 1024 * 1024;
export const MAX_FULL_PIXELS = 2048;
export const MAX_THUMB_BYTES = 12 * 1024;
export const MAX_THUMB_PIXELS = 256;
export const ALBUM_THUMB_BUDGET = 16_384; // 16 KiB shared across the album
export const MAX_IMAGES_PER_MESSAGE = 8;

const FULL_QUALITY_STEPS = [0.7, 0.5, 0.35];
const THUMB_QUALITY_STEPS = [0.6, 0.45, 0.3];

const FULL_PIXELS_STEPS = (max: number) =>
	[max, (max * 3) >> 2, max >> 1].filter((n) => n > 0);
const THUMB_PIXELS_STEPS = (max: number) =>
	[max, (max * 3) >> 2, max >> 1, max >> 2].filter((n) => n > 0);

/**
 * Per-image thumb budget for an `imageCount`-sized album. Mirrors
 * `AppPayload.perThumbBudget(imageCount:)` in `MunkelKit/AppPayload.swift`.
 */
export function perThumbBudget(imageCount: number): number {
	return Math.max(1_200, Math.floor(ALBUM_THUMB_BUDGET / Math.max(1, imageCount)));
}

let avifReady: Promise<void> | null = null;
async function ensureAvifReady(): Promise<void> {
	if (!avifReady) {
		avifReady = (async () => {
			await initAvifEncode();
			await initAvifDecode();
		})();
	}
	return avifReady;
}

export interface PreparedImage {
	/** Raw AVIF bytes (not yet sealed). */
	data: Uint8Array;
	mime: 'image/avif';
	width: number;
	height: number;
}

export interface PreparedThumb {
	/** Raw AVIF bytes (not yet sealed). */
	data: Uint8Array;
	width: number;
	height: number;
}

export interface ProbeResult {
	width: number;
	height: number;
	mime: string;
}

async function decodeToBitmap(source: Uint8Array): Promise<ImageBitmap | null> {
	try {
		const blob = new Blob([source as BlobPart]);
		return await createImageBitmap(blob);
	} catch {
		return null;
	}
}

async function drawInto(
	bitmap: ImageBitmap,
	maxPixels: number,
): Promise<ImageData | null> {
	// Compute target dims keeping aspect, longest side = maxPixels.
	const ratio = bitmap.width >= bitmap.height
		? maxPixels / bitmap.width
		: maxPixels / bitmap.height;
	const w = Math.max(1, Math.round(bitmap.width * ratio));
	const h = Math.max(1, Math.round(bitmap.height * ratio));
	try {
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0, w, h);
		return ctx.getImageData(0, 0, w, h);
	} catch {
		return null;
	}
}

async function encodeAvifOnce(
	imageData: ImageData,
	quality: number,
): Promise<Uint8Array | null> {
	try {
		const buf = await (encodeAvifInit as unknown as (
			data: ImageData,
			opts: { quality: number },
		) => Promise<ArrayBuffer>)(imageData, { quality });
		return new Uint8Array(buf);
	} catch {
		return null;
	}
}

export const imageCodec = {
	/**
	 * Read source bytes, downsample to fit `MAX_FULL_PIXELS`, AVIF-transcode
	 * to fit `MAX_FULL_BYTES`. Returns null on undecodable or unencodable
	 * input.
	 */
	async prepareFull(source: Uint8Array): Promise<PreparedImage | null> {
		await ensureAvifReady();
		const bitmap = await decodeToBitmap(source);
		if (!bitmap) return null;
		for (const pixels of FULL_PIXELS_STEPS(MAX_FULL_PIXELS)) {
			const imageData = await drawInto(bitmap, pixels);
			if (!imageData) continue;
			for (const quality of FULL_QUALITY_STEPS) {
				const avif = await encodeAvifOnce(imageData, quality);
				if (avif && avif.byteLength <= MAX_FULL_BYTES) {
					return {
						data: avif,
						mime: 'image/avif',
						width: imageData.width,
						height: imageData.height,
					};
				}
			}
		}
		return null;
	},

	/**
	 * Make an inline AVIF thumbnail for the relay pointer. `budgetBytes` is
	 * `perThumbBudget(imageCount)` — keeps the sealed pointer well under the
	 * relay's 48 KiB payload cap even at the 8-image max.
	 */
	async makeThumbnail(source: Uint8Array, budgetBytes: number): Promise<PreparedThumb | null> {
		await ensureAvifReady();
		const bitmap = await decodeToBitmap(source);
		if (!bitmap) return null;
		for (const pixels of THUMB_PIXELS_STEPS(MAX_THUMB_PIXELS)) {
			const imageData = await drawInto(bitmap, pixels);
			if (!imageData) continue;
			for (const quality of THUMB_QUALITY_STEPS) {
				const avif = await encodeAvifOnce(imageData, quality);
				if (avif && avif.byteLength <= budgetBytes) {
					return {
						data: avif,
						width: imageData.width,
						height: imageData.height,
					};
				}
			}
		}
		return null;
	},

	/**
	 * Decode bytes for display with a hard longest-side cap (decompression-
	 * bomb safe). Returns an `ImageBitmap` ready to paint via `drawImage`.
	 */
	async decode(
		bytes: Uint8Array,
		maxPixels: number = 1024,
	): Promise<ImageBitmap | null> {
		await ensureAvifReady();
		try {
			const blob = new Blob([bytes as BlobPart]);
			return await createImageBitmap(blob, {
				resizeWidth: maxPixels,
				resizeHeight: maxPixels,
				resizeQuality: 'high',
			});
		} catch {
			return null;
		}
	},

	/**
	 * Header-only pixel/dimension probe (no full decode). Returns null for
	 * unrecognized formats or corrupt headers.
	 */
	probe(source: Uint8Array): ProbeResult | null {
		try {
			const info = imageSize(source);
			if (!info.width || !info.height) return null;
			const mime = imageTypeToMime(info.type ?? '');
			return { width: info.width, height: info.height, mime };
		} catch {
			return null;
		}
	},
};

function imageTypeToMime(type: string): string {
	switch (type) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'webp':
			return 'image/webp';
		case 'gif':
			return 'image/gif';
		case 'avif':
			return 'image/avif';
		case 'heic':
		case 'heif':
			return 'image/heic';
		case 'svg':
			return 'image/svg+xml';
		default:
			return 'application/octet-stream';
	}
}

// Re-export to silence the "default only used as type" lint from the
// double-import of decodeAvifInit above.
export { decodeAvifInit as _decodeAvif };