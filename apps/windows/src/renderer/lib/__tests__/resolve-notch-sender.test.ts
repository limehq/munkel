import { describe, expect, it } from 'bun:test';
import { resolveNotchSender } from '../resolve-notch-sender';
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
