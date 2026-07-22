import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../global.css'), 'utf8');

describe('global.css recipient dropdown readability (P1.1)', () => {
	it('pins an explicit opaque background on <option> so the native Windows popup list is not white-on-white', () => {
		const match = css.match(/\.frosted-field\s+option\s*\{([^}]*)\}/);
		expect(match).not.toBeNull();

		const body = match![1];
		expect(body).toMatch(/background(-color)?\s*:\s*(?!transparent)[^;]+;/);
		expect(body).toMatch(/color\s*:\s*[^;]+;/);

		// The option background must not be white/near-white, since the text
		// color in this theme is white (`--munkel-text: #ffffff`).
		expect(body).not.toMatch(/background(-color)?\s*:\s*(#fff|#ffffff|white)\s*;/i);
	});

	it('sets color-scheme: dark on :root so Chromium themes native popups (e.g. the <select> list) dark instead of the OS light theme', () => {
		const match = css.match(/:root\s*\{([^}]*)\}/);
		expect(match).not.toBeNull();

		const body = match![1];
		expect(body).toMatch(/color-scheme\s*:\s*dark\s*;/);
	});
});
