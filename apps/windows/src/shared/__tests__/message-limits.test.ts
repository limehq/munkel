import { describe, it, expect } from 'bun:test';
import { MAX_MESSAGE_CHARS, clampMessageText } from '../message-limits';

/**
 * Mirrors `apps/macos/Sources/MunkelApp/MessageLimits.swift` (`maxCharacters
 * = 2048`) and the CLI's local `MAX_MESSAGE_CHARS` (`apps/cli/src/munkel.ts`).
 */
describe('message-limits (macOS MessageLimits parity)', () => {
	it('MAX_MESSAGE_CHARS is 2048', () => {
		expect(MAX_MESSAGE_CHARS).toBe(2048);
	});

	it('leaves text at exactly the cap untouched', () => {
		const text = 'x'.repeat(2048);
		expect(clampMessageText(text)).toBe(text);
		expect(clampMessageText(text).length).toBe(2048);
	});

	it('leaves text under the cap untouched', () => {
		expect(clampMessageText('hello')).toBe('hello');
	});

	it('truncates text over the cap to exactly 2048 characters', () => {
		const text = 'x'.repeat(2049);
		const clamped = clampMessageText(text);
		expect(clamped.length).toBe(2048);
		expect(clamped).toBe('x'.repeat(2048));
	});

	it('truncates a much longer text to exactly 2048 characters, keeping the prefix', () => {
		const text = 'abcdefghij'.repeat(1000); // 10,000 chars
		const clamped = clampMessageText(text);
		expect(clamped.length).toBe(2048);
		expect(clamped).toBe(text.slice(0, 2048));
	});

	it('handles empty text', () => {
		expect(clampMessageText('')).toBe('');
	});

	// Grapheme-safety (mirrors macOS's grapheme-cluster-based clamp): a
	// multi-code-unit character (emoji / ZWJ sequence) must never be sliced
	// through its middle, which a naive UTF-16 slice(0, 2048) would do.
	describe('grapheme safety', () => {
		it('does not split a surrogate-pair emoji when the cut lands mid-character', () => {
			// 2047 ASCII + a 2-code-unit emoji + trailing text → 2049 graphemes.
			// A naive code-unit slice(0, 2048) would keep only the emoji's high
			// surrogate (a lone surrogate); the grapheme clamp keeps the whole
			// emoji as the 2048th grapheme instead.
			const text = 'a'.repeat(2047) + '😀' + 'bbb';
			const clamped = clampMessageText(text);
			expect(clamped).toBe('a'.repeat(2047) + '😀');
			// No lone surrogate: iterating by code point yields exactly 2048 units.
			expect([...clamped].length).toBe(2048);
			expect(clamped.endsWith('😀')).toBe(true);
		});

		it('does not split a ZWJ (family) emoji cluster', () => {
			const family = '👨‍👩‍👧‍👦'; // single grapheme, many code points + ZWJ
			const text = 'a'.repeat(2047) + family + 'x';
			const clamped = clampMessageText(text);
			expect(clamped).toBe('a'.repeat(2047) + family);
			expect(clamped.endsWith(family)).toBe(true);
		});

		it('keeps a string of exactly 2048 emoji graphemes unmodified (even though it is 4096 code units)', () => {
			const text = '😀'.repeat(2048);
			const clamped = clampMessageText(text);
			expect(clamped).toBe(text);
			expect([...clamped].length).toBe(2048);
			expect(clamped.length).toBe(4096); // 2048 surrogate pairs
		});

		it('clamps 2049 emoji graphemes down to exactly 2048 whole graphemes', () => {
			const text = '😀'.repeat(2049);
			const clamped = clampMessageText(text);
			expect([...clamped].length).toBe(2048);
			expect(clamped).toBe('😀'.repeat(2048));
		});
	});
});
