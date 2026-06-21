import { describe, it, expect } from 'bun:test';
import { getCircleColor } from '../group-color';

/**
 * Mirrors `apps/macos/Sources/MunkelApp/GroupColor.swift`: 8 fixed colors,
 * selected by joined-list index. Any drift between the macOS palette and
 * this one is a cross-platform UI bug — the snapshot test below catches
 * that.
 */
describe('getCircleColor (palette parity with macOS)', () => {
	it('returns one of exactly 8 colors', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 100; i++) {
			seen.add(getCircleColor(i));
		}
		expect(seen.size).toBe(8);
	});

	it('returns distinct colors for indices 0…7', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 8; i++) {
			seen.add(getCircleColor(i));
		}
		expect(seen.size).toBe(8);
	});

	it('wraps around for indices past the palette length', () => {
		for (let i = 0; i < 8; i++) {
			expect(getCircleColor(i + 8)).toBe(getCircleColor(i));
			expect(getCircleColor(i + 16)).toBe(getCircleColor(i));
		}
	});

	it('handles negative indices defensively (modulo with positive result)', () => {
		// -1 should wrap to the last palette entry.
		expect(getCircleColor(-1)).toBe(getCircleColor(7));
		expect(getCircleColor(-9)).toBe(getCircleColor(7));
	});

	it('matches the macOS palette (snapshot)', () => {
		// If you intentionally change the palette, also change it in
		// apps/macos/Sources/MunkelApp/GroupColor.swift and update this list.
		expect([
			getCircleColor(0),
			getCircleColor(1),
			getCircleColor(2),
			getCircleColor(3),
			getCircleColor(4),
			getCircleColor(5),
			getCircleColor(6),
			getCircleColor(7),
		]).toEqual([
			'#3b82f6', // blue
			'#a855f7', // purple
			'#ec4899', // pink
			'#14b8a6', // teal
			'#eab308', // yellow
			'#6366f1', // indigo
			'#10b981', // mint
			'#92400e', // brown
		]);
	});

	it('never returns green or orange (reserved for connection status)', () => {
		for (let i = 0; i < 32; i++) {
			const c = getCircleColor(i).toLowerCase();
			expect(c).not.toBe('#22c55e');
			expect(c).not.toBe('#f59e0b');
			expect(c).not.toBe('#34c759');
			expect(c).not.toBe('#ff9f0a');
		}
	});
});