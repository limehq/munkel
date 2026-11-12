import { describe, expect, it } from 'bun:test';
import { resolvePaletteStartIndex, type PaletteRecipientSlot } from '../resolve-palette-start-index';

const recipients: PaletteRecipientSlot[] = [
	{ circleCode: 'blue-table-42', isEveryone: true },
	{ circleCode: 'blue-table-42', isEveryone: false, memberId: 'alice-uuid' },
	{ circleCode: 'blue-table-42', isEveryone: false, memberId: 'bob-uuid' },
	{ circleCode: 'red-door-7', isEveryone: true },
	{ circleCode: 'red-door-7', isEveryone: false, memberId: 'carol-uuid' },
	{ circleCode: 'red-door-7', isEveryone: false, memberId: 'bob-uuid' },
];

describe('resolvePaletteStartIndex', () => {
	it('selects the remembered member in the remembered channel', () => {
		expect(resolvePaletteStartIndex(recipients, { channel: 'blue-table-42', member: 'bob-uuid' })).toBe(2);
	});

	it('does not confuse a member with the same id in another channel', () => {
		expect(resolvePaletteStartIndex(recipients, { channel: 'red-door-7', member: 'bob-uuid' })).toBe(5);
	});

	it('selects the Everyone row when the remembered member is null', () => {
		expect(resolvePaletteStartIndex(recipients, { channel: 'red-door-7', member: null })).toBe(3);
	});

	it('falls back to the first row of the remembered channel when the member is gone', () => {
		expect(resolvePaletteStartIndex(recipients, { channel: 'red-door-7', member: 'departed-uuid' })).toBe(3);
	});

	it('falls back to index 0 when the remembered channel is gone', () => {
		expect(resolvePaletteStartIndex(recipients, { channel: 'gone-channel-1', member: 'bob-uuid' })).toBe(0);
	});

	it('falls back to index 0 when nothing was remembered', () => {
		expect(resolvePaletteStartIndex(recipients, { channel: null, member: null })).toBe(0);
	});

	it('returns 0 when there are no recipients', () => {
		expect(resolvePaletteStartIndex([], { channel: 'blue-table-42', member: 'bob-uuid' })).toBe(0);
	});
});
