/** Raw-byte budget for outgoing avatars. See AvatarCodec.swift. */
export const MAX_AVATAR_BYTES = 20_480;
/** Longest side for decoded avatars; prevents tiny JPEGs from declaring huge dimensions. */
export const MAX_DECODED_PIXELS = 256;
/** Longest side for ENCODED avatars; matches macOS AvatarCodec.maxEncodedPixels (vectors.json codecConstants.avatar.maxEncodedPixels). */
export const MAX_ENCODED_PIXELS = 128;

const JPEG_QUALITIES = [80, 60, 40] as const;
const DOWNSCALE_FACTOR = 0.75;

type SharpModule = typeof import('sharp');
type SharpFn = SharpModule['default'];

/**
 * Load `sharp` on first encode only. Keeping the require off the module
 * top-level means main-process cold start no longer pays native-addon init
 * until GitHub avatar encoding actually runs (Plan 12 / Phase 1.3).
 */
let sharpModule: SharpFn | null = null;

async function getSharp(): Promise<SharpFn> {
	if (!sharpModule) {
		const mod = await import('sharp');
		sharpModule = mod.default;
	}
	return sharpModule;
}

export class SharpAvatarCodec {
	async encode(imageData: Uint8Array): Promise<Uint8Array> {
		const sharpFn = await getSharp();
		const input = Buffer.from(imageData);
		const metadata = await sharpFn(input).metadata();
		const width = metadata.width ?? 0;
		const height = metadata.height ?? 0;

		if (width <= 0 || height <= 0) {
			throw new Error('Avatar metadata is missing dimensions');
		}

		let [targetWidth, targetHeight] = fitWithinBounds(width, height, MAX_ENCODED_PIXELS);
		while (targetWidth >= 1 && targetHeight >= 1) {
			for (const quality of JPEG_QUALITIES) {
				const output = await sharpFn(input)
					.rotate()
					.resize(targetWidth, targetHeight, {
						fit: 'inside',
						withoutEnlargement: true,
					})
					.jpeg({ quality, mozjpeg: true })
					.toBuffer();

				if (output.length <= MAX_AVATAR_BYTES) {
					return new Uint8Array(output);
				}
			}

			if (targetWidth === 1 && targetHeight === 1) {
				break;
			}

			targetWidth = Math.max(1, Math.floor(targetWidth * DOWNSCALE_FACTOR));
			targetHeight = Math.max(1, Math.floor(targetHeight * DOWNSCALE_FACTOR));
		}

		throw new Error(`Avatar exceeds ${MAX_AVATAR_BYTES} bytes after JPEG encoding`);
	}
}

function fitWithinBounds(width: number, height: number, maxSide: number): [number, number] {
	const longestSide = Math.max(width, height);
	if (longestSide <= maxSide) {
		return [width, height];
	}

	const scale = maxSide / longestSide;
	return [
		Math.max(1, Math.round(width * scale)),
		Math.max(1, Math.round(height * scale)),
	];
}
