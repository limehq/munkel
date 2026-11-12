import { describe, expect, it } from 'bun:test';
import { resolveReplyRecipient } from '../resolve-reply-recipient';
import type { NotchMessage } from '../../../shared/types';

const baseMessage: NotchMessage = {
	sender: 'Alice',
	senderMemberId: 'peer-uuid',
	text: 'Hi',
	isDirect: true,
	group: 'blue-table-42',
	groupColor: '#3b82f6',
	receivedAt: '2026-07-02T12:00:00.000Z',
};

describe('resolveReplyRecipient', () => {
	it('returns undefined to for broadcast replies', () => {
		expect(resolveReplyRecipient(baseMessage, false)).toEqual({ ok: true, to: undefined });
	});

	it('uses senderMemberId for private replies', () => {
		expect(resolveReplyRecipient(baseMessage, true)).toEqual({ ok: true, to: 'peer-uuid' });
	});

	it('fail-closed when senderMemberId is missing on a private reply', () => {
		const message = { ...baseMessage, senderMemberId: undefined };
		const result = resolveReplyRecipient(message, true);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('sender unknown');
		}
	});
});

describe('resolveReplyRecipient for own messages (#123)', () => {
	const ownDm: NotchMessage = {
		...baseMessage,
		sender: 'Me',
		senderMemberId: 'me-uuid',
		recipientMemberId: 'peer-uuid',
		isOwn: true,
		isDirect: true,
	};

	it('a private reply to an own DM targets the recipient, never ourselves', () => {
		expect(resolveReplyRecipient(ownDm, true)).toEqual({ ok: true, to: 'peer-uuid' });
	});

	it('a broadcast reply to an own broadcast stays a broadcast', () => {
		const ownBroadcast = { ...ownDm, isDirect: false, recipientMemberId: undefined };
		expect(resolveReplyRecipient(ownBroadcast, false)).toEqual({ ok: true, to: undefined });
	});

	it('fail-closed for a private reply to an own message without a recipient', () => {
		const message = { ...ownDm, recipientMemberId: undefined };
		const result = resolveReplyRecipient(message, true);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('recipient unknown');
		}
	});
});
