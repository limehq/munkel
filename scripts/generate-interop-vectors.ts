#!/usr/bin/env bun
/**
 * Regenerates scripts/interop-vectors/vectors.json from the Windows reference
 * implementation. Swift tests consume the same file for cross-platform parity.
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveGroupKeys, sealWithNonce } from '../apps/windows/src/core/crypto';
import { decodePayload } from '../apps/windows/src/core/payload';
import {
	ALBUM_THUMB_BUDGET,
	MAX_FULL_BYTES,
	MAX_FULL_PIXELS,
	MAX_IMAGES_PER_MESSAGE,
	MAX_THUMB_BYTES,
	MAX_THUMB_PIXELS,
	imageCodec,
	perThumbBudget,
} from '../apps/windows/src/core/image-codec';
import { MAX_AVATAR_BYTES, MAX_DECODED_PIXELS } from '../apps/windows/src/core/avatar';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'interop-vectors');
const OUT = join(ROOT, 'vectors.json');

/** Fixed nonce for deterministic cross-platform sealed payloads. */
const INTEROP_NONCE = new Uint8Array(12); // twelve zero bytes

const ONE_BY_ONE_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const payloads = [
	{
		id: 'chat-basic',
		json: JSON.stringify({ kind: 'chat', text: 'coffee?', sentAt: '1970-01-01T00:00:00.000Z' }),
	},
	{
		id: 'profile-no-avatar',
		json: JSON.stringify({ kind: 'profile', displayName: 'Alex' }),
	},
	{
		id: 'profile-with-avatar',
		json: JSON.stringify({
			kind: 'profile',
			displayName: 'Alex',
			avatar: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64'),
		}),
	},
	{
		id: 'image-single',
		json: JSON.stringify({
			kind: 'image',
			items: [
				{
					r2Key: 'abc1234567890abcd',
					mime: 'image/avif',
					width: 1,
					height: 1,
					byteLen: 512,
					thumb: Buffer.from([0x01, 0x02, 0x03]).toString('base64'),
				},
			],
			caption: 'deploy is green 🚀',
			sentAt: '2023-11-14T22:13:20.000Z',
		}),
	},
] as const;

const derivation = [
	{ code: 'blue-table-42', groupId: 'aaf5dc7308fe4bede46cdebc9390813d' },
	{ code: '  Blue-Table-42\n', groupId: 'aaf5dc7308fe4bede46cdebc9390813d' },
	{ code: 'red-chair-7', groupId: 'pending' },
] as Array<{ code: string; groupId: string }>;

for (const entry of derivation) {
	if (entry.groupId === 'pending') {
		const { groupId } = await deriveGroupKeys(entry.code);
		entry.groupId = groupId;
	}
}

const sealed: Array<{
	id: string;
	code: string;
	payloadId: string;
	nonceBase64: string;
	sealedBase64: string;
}> = [];

for (const payload of payloads) {
	const code = 'blue-table-42';
	const { messageKey } = await deriveGroupKeys(code);
	const sealedBase64 = await sealWithNonce(payload.json, messageKey, INTEROP_NONCE);
	sealed.push({
		id: `sealed-${payload.id}`,
		code,
		payloadId: payload.id,
		nonceBase64: Buffer.from(INTEROP_NONCE).toString('base64'),
		sealedBase64,
	});
}

// Sanity: Windows decode round-trip before writing.
for (const entry of sealed) {
	const { messageKey } = await deriveGroupKeys(entry.code);
	const opened = await (async () => {
		const { open } = await import('../apps/windows/src/core/crypto');
		return open(entry.sealedBase64, messageKey);
	})();
	const payload = payloads.find((p) => p.id === entry.payloadId)!;
	if (opened !== payload.json) {
		throw new Error(`pre-write sanity failed for ${entry.id}`);
	}
	decodePayload(opened);
}

const pngBytes = new Uint8Array(ONE_BY_ONE_PNG);
let imageFixtures: unknown[] = [];
try {
	const full = await imageCodec.prepareFull(pngBytes);
	const thumb = await imageCodec.makeThumbnail(pngBytes, MAX_THUMB_BYTES);
	if (full && thumb) {
		const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
		imageFixtures = [
			{
				id: '1x1-red-png',
				pngBase64: ONE_BY_ONE_PNG.toString('base64'),
				prepareFull: {
					mime: full.mime,
					width: full.width,
					height: full.height,
					maxBytes: MAX_FULL_BYTES,
					sha256: sha256(full.data),
				},
				makeThumbnail: {
					maxBytes: MAX_THUMB_BYTES,
					sha256: sha256(thumb.data),
				},
			},
		];
	} else {
		process.stderr.write('[generate-interop-vectors] image codec unavailable — skipping imageFixtures (run on Windows with OffscreenCanvas support)\n');
	}
} catch (err) {
	process.stderr.write(`[generate-interop-vectors] image codec error — skipping imageFixtures: ${err instanceof Error ? err.message : String(err)}\n`);
}

const vectors = {
	version: 1,
	generatedAt: new Date().toISOString(),
	generatedBy: 'scripts/generate-interop-vectors.ts (Windows/Bun)',
	derivation,
	payloads: payloads.map((p) => ({ id: p.id, json: p.json })),
	sealed,
	codecConstants: {
		avatar: {
			maxEncodedBytes: 20_480,
			maxEncodedPixels: 128,
			maxDecodedPixels: MAX_DECODED_PIXELS,
			windowsMaxAvatarBytes: MAX_AVATAR_BYTES,
		},
		image: {
			maxFullBytes: MAX_FULL_BYTES,
			maxFullPixels: MAX_FULL_PIXELS,
			maxThumbBytes: MAX_THUMB_BYTES,
			maxThumbPixels: MAX_THUMB_PIXELS,
			albumThumbBudget: ALBUM_THUMB_BUDGET,
			maxImagesPerMessage: MAX_IMAGES_PER_MESSAGE,
			perThumbBudget: {
				'1': perThumbBudget(1),
				'8': perThumbBudget(8),
				'64': perThumbBudget(64),
			},
		},
	},
	imageFixtures,
};

writeFileSync(OUT, `${JSON.stringify(vectors, null, 2)}\n`, 'utf8');
process.stdout.write(`[generate-interop-vectors] wrote ${OUT}\n`);
