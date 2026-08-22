import { describe, expect, it } from 'bun:test';
import { memberLabel } from '../member-label';

describe('memberLabel', () => {
	it('prefers a trimmed display name', () => {
		expect(memberLabel({ memberId: '602a0e2c-abcd-efgh', displayName: '  Alice  ' })).toBe('Alice');
	});

	it('falls back to the first 8 characters of the member id', () => {
		expect(memberLabel({ memberId: '602a0e2c-abcd-efgh-ijkl-mnopqrstuvwx' })).toBe('602a0e2c');
	});

	it('treats blank display names as missing', () => {
		expect(memberLabel({ memberId: 'peer-1', displayName: '   ' })).toBe('peer-1');
	});
});
