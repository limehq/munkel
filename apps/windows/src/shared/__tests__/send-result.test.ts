import { describe, expect, it } from 'bun:test';
import { formatSkippedImages } from '../send-result';

describe('formatSkippedImages', () => {
	it('formats named skip reasons for UI and CLI', () => {
		const text = formatSkippedImages([
			{ path: 'C:/a.png', reason: 'Could not encode C:/a.png' },
			{ path: 'C:/b.png', reason: 'File too large: C:/b.png (33.0 MiB; max 32.0 MiB)' },
		]);
		expect(text).toContain('Skipped 2 images');
		expect(text).toContain('C:/a.png: Could not encode C:/a.png');
		expect(text).toContain('C:/b.png: File too large');
	});
});
