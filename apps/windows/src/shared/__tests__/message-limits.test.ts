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
});
