import { describe, expect, it } from 'bun:test';
import { pruneNotchHistory } from '../prune-notch-history';

const now = Date.parse('2026-07-02T12:01:00.000Z');

describe('pruneNotchHistory', () => {
	it('keeps entries newer than 60 seconds and drops 60s-old entries', () => {
		const kept = { receivedAt: '2026-07-02T12:00:01.000Z', label: 'kept' };
		const pruned = { receivedAt: '2026-07-02T12:00:00.000Z', label: 'pruned' };
		expect(pruneNotchHistory([kept, pruned], now)).toEqual([kept]);
	});

	it('handles empty and mixed arrays', () => {
		expect(pruneNotchHistory([], now)).toEqual([]);

		const items = [
			{ receivedAt: '2026-07-02T12:00:30.000Z', id: 'new' },
			{ receivedAt: '2026-07-02T11:59:30.000Z', id: 'old' },
			{ receivedAt: '2026-07-02T12:00:59.000Z', id: 'latest' },
		];

		expect(pruneNotchHistory(items, now)).toEqual([
			{ receivedAt: '2026-07-02T12:00:30.000Z', id: 'new' },
			{ receivedAt: '2026-07-02T12:00:59.000Z', id: 'latest' },
		]);
	});

	it('supports a custom window override', () => {
		const items = [
			{ receivedAt: '2026-07-02T12:00:31.000Z', id: 'kept' },
			{ receivedAt: '2026-07-02T12:00:29.000Z', id: 'dropped' },
		];

		expect(pruneNotchHistory(items, now, 30_000)).toEqual([
			{ receivedAt: '2026-07-02T12:00:31.000Z', id: 'kept' },
		]);
	});
});
