import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
	ALBUM_THUMB_BUDGET,
	MAX_FULL_BYTES,
	MAX_FULL_PIXELS,
	MAX_IMAGES_PER_MESSAGE,
	MAX_THUMB_BYTES,
	MAX_THUMB_PIXELS,
	imageCodec,
	perThumbBudget,
} from '../image-codec';
import { MAX_AVATAR_BYTES, MAX_DECODED_PIXELS } from '../avatar';
import { deriveGroupKeys, open, sealWithNonce } from '../crypto';
import { decodePayload } from '../payload';

interface VectorsFile {
	version: number;
	derivation: Array<{ code: string; groupId: string }>;
	payloads: Array<{ id: string; json: string }>;
	sealed: Array<{
		id: string;
		code: string;
		payloadId: string;
		nonceBase64: string;
		sealedBase64: string;
	}>;
	codecConstants: {
		avatar: {
			maxEncodedBytes: number;
			maxEncodedPixels: number;
			maxDecodedPixels: number;
			windowsMaxAvatarBytes: number;
		};
		image: {
			maxFullBytes: number;
			maxFullPixels: number;
			maxThumbBytes: number;
			maxThumbPixels: number;
			albumThumbBudget: number;
			maxImagesPerMessage: number;
			perThumbBudget: Record<string, number>;
		};
	};
	imageFixtures: Array<{
		id: string;
		pngBase64: string;
		prepareFull: { mime: string; width: number; height: number; maxBytes: number; sha256: string };
		makeThumbnail: { maxBytes: number; sha256: string };
	}>;
}

const VECTORS_PATH = join(import.meta.dir, '../../../../../scripts/interop-vectors/vectors.json');
const vectors: VectorsFile = JSON.parse(readFileSync(VECTORS_PATH, 'utf8'));

describe('Swift ↔ Windows interop vectors', () => {
	it('loads vectors.json version 1', () => {
		expect(vectors.version).toBe(1);
		expect(vectors.derivation.length).toBeGreaterThan(0);
		expect(vectors.sealed.length).toBe(vectors.payloads.length);
	});

	describe('derivation (HKDF group-id)', () => {
		for (const entry of vectors.derivation) {
			it(`groupId for ${JSON.stringify(entry.code)}`, async () => {
				const { groupId } = await deriveGroupKeys(entry.code);
				expect(groupId).toBe(entry.groupId);
			});
		}
	});

	describe('payload JSON decode', () => {
		for (const payload of vectors.payloads) {
			it(`decodes ${payload.id}`, () => {
				const decoded = decodePayload(payload.json);
				expect(decoded.kind).toBe(JSON.parse(payload.json).kind);
			});
		}
	});

	describe('sealed cross-open (fixed nonce)', () => {
		for (const entry of vectors.sealed) {
			it(`opens ${entry.id} and matches canonical JSON`, async () => {
				const { messageKey } = await deriveGroupKeys(entry.code);
				const opened = await open(entry.sealedBase64, messageKey);
				const canonical = vectors.payloads.find((p) => p.id === entry.payloadId)!.json;
				expect(opened).toBe(canonical);
				decodePayload(opened);
			});

			it(`re-seals ${entry.id} to the same blob`, async () => {
				const canonical = vectors.payloads.find((p) => p.id === entry.payloadId)!.json;
				const { messageKey } = await deriveGroupKeys(entry.code);
				const nonce = Buffer.from(entry.nonceBase64, 'base64');
				const resealed = await sealWithNonce(canonical, messageKey, nonce);
				expect(resealed).toBe(entry.sealedBase64);
			});
		}
	});

	describe('codec constants (mirror AvatarCodec.swift / ImageCodec.swift)', () => {
		it('avatar budgets match macOS', () => {
			expect(vectors.codecConstants.avatar.maxEncodedBytes).toBe(20_480);
			expect(vectors.codecConstants.avatar.maxEncodedPixels).toBe(128);
			expect(MAX_AVATAR_BYTES).toBe(vectors.codecConstants.avatar.windowsMaxAvatarBytes);
			expect(MAX_DECODED_PIXELS).toBe(vectors.codecConstants.avatar.maxDecodedPixels);
		});

		it('image budgets match macOS', () => {
			const c = vectors.codecConstants.image;
			expect(MAX_FULL_BYTES).toBe(c.maxFullBytes);
			expect(MAX_FULL_PIXELS).toBe(c.maxFullPixels);
			expect(MAX_THUMB_BYTES).toBe(c.maxThumbBytes);
			expect(MAX_THUMB_PIXELS).toBe(c.maxThumbPixels);
			expect(ALBUM_THUMB_BUDGET).toBe(c.albumThumbBudget);
			expect(MAX_IMAGES_PER_MESSAGE).toBe(c.maxImagesPerMessage);
			expect(perThumbBudget(1)).toBe(c.perThumbBudget['1']);
			expect(perThumbBudget(8)).toBe(c.perThumbBudget['8']);
			expect(perThumbBudget(64)).toBe(c.perThumbBudget['64']);
		});
	});

	if (vectors.imageFixtures.length > 0) {
		describe('image codec AVIF output (Electron/Bun canvas)', () => {
			for (const fixture of vectors.imageFixtures) {
				it(`${fixture.id} prepareFull matches pinned sha256`, async () => {
					const png = Buffer.from(fixture.pngBase64, 'base64');
					const full = await imageCodec.prepareFull(png);
					expect(full).not.toBeNull();
					const sha256 = await crypto.subtle.digest('SHA-256', full!.data);
					const hex = [...new Uint8Array(sha256)].map((b) => b.toString(16).padStart(2, '0')).join('');
					expect(hex).toBe(fixture.prepareFull.sha256);
					expect(full!.mime).toBe(fixture.prepareFull.mime);
					expect(full!.width).toBe(fixture.prepareFull.width);
					expect(full!.height).toBe(fixture.prepareFull.height);
				});

				it(`${fixture.id} makeThumbnail matches pinned sha256`, async () => {
					const png = Buffer.from(fixture.pngBase64, 'base64');
					const thumb = await imageCodec.makeThumbnail(png, fixture.makeThumbnail.maxBytes);
					expect(thumb).not.toBeNull();
					const sha256 = await crypto.subtle.digest('SHA-256', thumb!.data);
					const hex = [...new Uint8Array(sha256)].map((b) => b.toString(16).padStart(2, '0')).join('');
					expect(hex).toBe(fixture.makeThumbnail.sha256);
				});
			}
		});
	}
});
