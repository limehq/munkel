import { describe, expect, it, afterEach } from 'bun:test';
import { clipboardEventHasImage, pasteClipboardImage } from '../clipboard-image';

describe('clipboardEventHasImage (Plan 12 P3.4)', () => {
	it('detects an image MIME type among clipboardData.types', () => {
		expect(clipboardEventHasImage({ clipboardData: { types: ['image/png'] } as unknown as DataTransfer })).toBe(true);
	});

	it('detects an image type even alongside other types (e.g. Files)', () => {
		expect(
			clipboardEventHasImage({
				clipboardData: { types: ['Files', 'image/png'] } as unknown as DataTransfer,
			}),
		).toBe(true);
	});

	it('returns false for a text-only clipboard', () => {
		expect(clipboardEventHasImage({ clipboardData: { types: ['text/plain'] } as unknown as DataTransfer })).toBe(false);
	});

	it('returns false for a bare "Files" type with no image/* MIME (e.g. a non-image file paste)', () => {
		expect(clipboardEventHasImage({ clipboardData: { types: ['Files'] } as unknown as DataTransfer })).toBe(false);
	});

	it('returns false when clipboardData is null', () => {
		expect(clipboardEventHasImage({ clipboardData: null })).toBe(false);
	});

	it('returns false when clipboardData.types is empty', () => {
		expect(clipboardEventHasImage({ clipboardData: { types: [] } as unknown as DataTransfer })).toBe(false);
	});
});

describe('pasteClipboardImage (Plan 12 P3.4)', () => {
	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
	});

	it('returns the temp-file path the main process resolved', async () => {
		(globalThis as unknown as { window: unknown }).window = {
			electronAPI: { saveClipboardImage: () => Promise.resolve('/tmp/munkel-clipboard-1.png') },
		};
		expect(await pasteClipboardImage()).toBe('/tmp/munkel-clipboard-1.png');
	});

	it('returns null when the main process reports no clipboard image', async () => {
		(globalThis as unknown as { window: unknown }).window = {
			electronAPI: { saveClipboardImage: () => Promise.resolve(null) },
		};
		expect(await pasteClipboardImage()).toBeNull();
	});

	it('returns null (does not throw) when the IPC call rejects', async () => {
		(globalThis as unknown as { window: unknown }).window = {
			electronAPI: { saveClipboardImage: () => Promise.reject(new Error('ipc failed')) },
		};
		await expect(pasteClipboardImage()).resolves.toBeNull();
	});
});
