import { describe, expect, it } from 'bun:test';
import { notchPhaseForElapsed } from '../notch-phase';

describe('notchPhaseForElapsed', () => {
	it('returns full before the 5s boundary', () => {
		expect(notchPhaseForElapsed(0)).toBe('full');
		expect(notchPhaseForElapsed(4_999)).toBe('full');
	});

	it('returns peek from 5s until just before 35s', () => {
		expect(notchPhaseForElapsed(5_000)).toBe('peek');
		expect(notchPhaseForElapsed(34_999)).toBe('peek');
	});

	it('returns retracted at and after 35s', () => {
		expect(notchPhaseForElapsed(35_000)).toBe('retracted');
		expect(notchPhaseForElapsed(60_000)).toBe('retracted');
	});
});
