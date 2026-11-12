import { describe, expect, it } from 'bun:test';
import { insertNotchEntry } from '../notch-order';
import type { NotchHistoryEntry } from '../useNotchLifecycle';

function entry(id: string, overrides: Partial<NotchHistoryEntry> = {}): NotchHistoryEntry {
	return {
		id,
		sender: 'Alice',
		text: id,
		isDirect: false,
		group: 'test-circle',
		groupColor: '#3b82f6',
		receivedAt: at(0),
		...overrides,
	};
}

function at(ms: number): string {
	return new Date(ms).toISOString();
}

describe('insertNotchEntry', () => {
	it('places a late-arriving older message below the newest one', () => {
		const newer = entry('newer', { sentAt: at(20_000), receivedAt: at(20_000) });
		const older = entry('older', { sentAt: at(10_000), receivedAt: at(25_000) });
		const history = insertNotchEntry([newer], older);
		expect(history.map((e) => e.id)).toEqual(['newer', 'older']);
	});

	it('puts a newer sentAt on top even when it arrives last', () => {
		const older = entry('older', { sentAt: at(10_000), receivedAt: at(10_000) });
		const newer = entry('newer', { sentAt: at(20_000), receivedAt: at(20_000) });
		const history = insertNotchEntry([older], newer);
		expect(history.map((e) => e.id)).toEqual(['newer', 'older']);
	});

	it('breaks a sentAt tie by receivedAt', () => {
		const early = entry('early', { sentAt: at(10_000), receivedAt: at(1_000) });
		const late = entry('late', { sentAt: at(10_000), receivedAt: at(2_000) });
		const history = insertNotchEntry([early], late);
		expect(history.map((e) => e.id)).toEqual(['late', 'early']);
	});

	it('falls back to receivedAt when sentAt is missing', () => {
		const first = entry('first', { receivedAt: at(1_000) });
		const second = entry('second', { receivedAt: at(2_000) });
		const history = insertNotchEntry([first], second);
		expect(history.map((e) => e.id)).toEqual(['second', 'first']);
	});

	it('does not let a sentAt in the future displace a newer real message', () => {
		const skewed = entry('skewed', { sentAt: at(70_000), receivedAt: at(10_000) });
		const real = entry('real', { sentAt: at(20_000), receivedAt: at(20_000) });
		const history = insertNotchEntry([skewed], real);
		expect(history.map((e) => e.id)).toEqual(['real', 'skewed']);
	});

	it('falls back to receivedAt when sentAt cannot be parsed', () => {
		const other = entry('other', { sentAt: at(3_000), receivedAt: at(2_000) });
		const garbled = entry('garbled', { sentAt: 'not-a-date', receivedAt: at(4_000) });
		const history = insertNotchEntry([other], garbled);
		expect(history.map((e) => e.id)).toEqual(['garbled', 'other']);
	});

	it('keeps the most recently inserted entry on top for an exact tie', () => {
		const first = entry('first');
		const second = entry('second');
		const history = insertNotchEntry([first], second);
		expect(history.map((e) => e.id)).toEqual(['second', 'first']);
	});
});
