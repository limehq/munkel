import { describe, it, expect } from 'bun:test';
import {
	imageCodec,
	MAX_FULL_BYTES,
	MAX_FULL_PIXELS,
	MAX_THUMB_PIXELS,
	MAX_THUMB_BYTES,
	ALBUM_THUMB_BUDGET,
	MAX_IMAGES_PER_MESSAGE,
	perThumbBudget,
} from '../image-codec';

/**
 * Hand-crafted minimum-viable PNG — 4×4 RGB pixels. Used for the
 * pure-JS probe path so we can exercise `image-size` without a canvas.
 * Real PNG: 8-byte signature + IHDR + IDAT + IEND.
 *
 * `imageCodec.prepareFull` / `makeThumbnail` need `OffscreenCanvas` +
 * `createImageBitmap` (Electron renderer) and are covered by the
 * `windows-ci` follow-up branch; see Risks in the plan file.
 */

// Solid-color scanlines: filter=0 + RGB per pixel.
function makeSolidPng(width: number, height: number, r: number, g: number, b: number): Uint8Array {
	const rowSize = 1 + width * 3;
	const raw = new Uint8Array(rowSize * height);
	for (let y = 0; y < height; y++) {
		raw[y * rowSize] = 0; // filter: none
		for (let x = 0; x < width; x++) {
			const off = y * rowSize + 1 + x * 3;
			raw[off + 0] = r & 0xff;
			raw[off + 1] = g & 0xff;
			raw[off + 2] = b & 0xff;
		}
	}
	return pngWrap(width, height, raw);
}

function pngWrap(width: number, height: number, raw: Uint8Array): Uint8Array {
	// Lazy imports so the test file doesn't fail to load in environments
	// without node:zlib (e.g. some bundlers). Bun:test always has it.
	const { deflateSync } = require('node:zlib') as typeof import('node:zlib');
	const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, width);
	v.setUint32(4, height);
	ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
	const idat = new Uint8Array(deflateSync(raw));
	return concat([
		sig,
		chunk('IHDR', ihdr),
		chunk('IDAT', idat),
		chunk('IEND', new Uint8Array(0)),
	]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
	const len = u32be(data.length);
	const typeBytes = new TextEncoder().encode(type);
	const crc = u32be(crc32(concat([typeBytes, data])));
	return concat([len, typeBytes, data, crc]);
}

function u32be(n: number): Uint8Array {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setUint32(0, n >>> 0, false);
	return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((s, p) => s + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) { out.set(p, off); off += p.length; }
	return out;
}

// Standard CRC-32 (polynomial 0xEDB88320).
const CRC_TABLE: number[] = (() => {
	const t: number[] = [];
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
		t.push(c >>> 0);
	}
	return t;
})();

function crc32(buf: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

describe('imageCodec constants (mirror ImageCodec.swift)', () => {
	it('MAX_FULL_BYTES = 2 MiB', () => expect(MAX_FULL_BYTES).toBe(2 * 1024 * 1024));
	it('MAX_FULL_PIXELS = 2048', () => expect(MAX_FULL_PIXELS).toBe(2048));
	it('MAX_THUMB_BYTES = 12 KiB', () => expect(MAX_THUMB_BYTES).toBe(12 * 1024));
	it('MAX_THUMB_PIXELS = 256', () => expect(MAX_THUMB_PIXELS).toBe(256));
	it('ALBUM_THUMB_BUDGET = 16 KiB', () => expect(ALBUM_THUMB_BUDGET).toBe(16_384));
	it('MAX_IMAGES_PER_MESSAGE = 8', () => expect(MAX_IMAGES_PER_MESSAGE).toBe(8));
});

describe('perThumbBudget (mirror AppPayload.perThumbBudget)', () => {
	it('1-image album gets the full 16 KiB', () => expect(perThumbBudget(1)).toBe(16_384));
	it('8-image album splits evenly with no floor', () => expect(perThumbBudget(8)).toBe(2_048));
	it('floors at 1_200 for very large albums', () => expect(perThumbBudget(64)).toBe(1_200));
	it('clamps to ≥1 image', () => expect(perThumbBudget(0)).toBe(16_384));
});

describe('imageCodec.probe', () => {
	it('returns pixel dimensions for a known PNG', () => {
		const png = makeSolidPng(64, 32, 0x33, 0x66, 0x99);
		const info = imageCodec.probe(png);
		expect(info).not.toBeNull();
		expect(info!.width).toBe(64);
		expect(info!.height).toBe(32);
		expect(info!.mime).toBe('image/png');
	});

	it('returns null for undecodable bytes', () => {
		const junk = new Uint8Array([0, 1, 2, 3, 4, 5]);
		expect(imageCodec.probe(junk)).toBeNull();
	});

	it('returns null for an empty buffer', () => {
		expect(imageCodec.probe(new Uint8Array(0))).toBeNull();
	});
});

describe('imageCodec pipeline (Electron-only)', () => {
	// `prepareFull` / `makeThumbnail` / `decode` rely on `OffscreenCanvas`
	// + `createImageBitmap`, which are Electron renderer globals and not
	// exposed by `bun:test`. Coverage for these lands on the
	// `platform/windows/windows-ci` runner. The pure-logic paths above
	// keep the contract pinned.
	it.skip('prepareFull returns an AVIF within MAX_FULL_BYTES', async () => {
		// Placeholder; real test runs under Electron renderer context.
	});

	it.skip('makeThumbnail produces a ≤256px AVIF within the per-album budget', async () => {
		// Placeholder; real test runs under Electron renderer context.
	});
});