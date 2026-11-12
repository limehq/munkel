import { describe, expect, it } from 'bun:test';
import { resolveNotchRecipient, resolveNotchSender } from '../resolve-notch-sender';
import type { NotchHistoryEntry } from '../useNotchLifecycle';

function makeEntry(overrides: Partial<NotchHistoryEntry> = {}): NotchHistoryEntry {
	return {
		id: 'entry-1',
		sender: '602a0e2c-abcd-efgh-ijkl-mnopqrstuvwx',
		senderMemberId: '602a0e2c-abcd-efgh-ijkl-mnopqrstuvwx',
		text: 'hello',
		isDirect: false,
		group: 'blue-table-42',
		groupColor: '#336699',
		receivedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}

describe('resolveNotchSender', () => {
	it('uses the live member display name when the roster has caught up', () => {
		const entry = makeEntry();
		const label = resolveNotchSender(entry, [
			{
				code: 'blue-table-42',
				groupId: 'abc',
				isConnected: true,
				relayUrl: 'wss://relay.example/ws',
				members: [{ memberId: entry.senderMemberId!, displayName: 'Alice', joinedAt: '2026-01-01T00:00:00.000Z' }],
			},
		]);
		expect(label).toBe('Alice');
	});

	it('falls back to the stored sender when the member is unknown', () => {
		const entry = makeEntry({ sender: '602a0e2c' });
		expect(resolveNotchSender(entry, [])).toBe('602a0e2c');
	});

	it('uses memberLabel for own identity (empty displayName → first 8 of memberId, never You)', () => {
		const entry = makeEntry({
			senderMemberId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
			sender: 'stale',
		});
		expect(
			resolveNotchSender(entry, [], {
				memberId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
				displayName: '   ',
			}),
		).toBe('aaaaaaaa');
		expect(
			resolveNotchSender(entry, [], {
				memberId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
				displayName: 'Rodgi',
			}),
		).toBe('Rodgi');
	});
});

describe('resolveNotchRecipient (#123)', () => {
	const circles = [
		{
			code: 'blue-table-42',
			groupId: 'g',
			isConnected: true,
			relayUrl: 'ws://127.0.0.1:1',
			members: [{ memberId: 'peer-uuid-0000', displayName: 'Bob', joinedAt: '2026-01-01T00:00:00.000Z' }],
		},
	];

	it('resolves the recipient of an own DM to the roster display name', () => {
		const entry = makeEntry({ isOwn: true, recipientMemberId: 'peer-uuid-0000' });
		expect(resolveNotchRecipient(entry, circles)).toBe('Bob');
	});

	it('falls back to the first 8 characters of the recipient id when the roster has no match', () => {
		const entry = makeEntry({ isOwn: true, recipientMemberId: 'unknown-uuid-9999' });
		expect(resolveNotchRecipient(entry, circles)).toBe('unknown-');
	});

	it('returns undefined for an entry without a recipient (broadcast)', () => {
		expect(resolveNotchRecipient(makeEntry({ isOwn: true }), circles)).toBeUndefined();
	});
});
