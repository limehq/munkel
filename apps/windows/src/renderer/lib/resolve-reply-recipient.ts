import type { NotchMessage } from '../../shared/types';

export type ReplyRecipientResult =
	| { ok: true; to?: string }
	| { ok: false; error: string };

/** Resolve the wire `to` field for a notch inline reply. Fail-closed for private replies. */
export function resolveReplyRecipient(
	message: NotchMessage,
	replyPrivate: boolean,
): ReplyRecipientResult {
	if (!replyPrivate) {
		return { ok: true, to: undefined };
	}
	if (!message.senderMemberId) {
		return {
			ok: false,
			error: 'Cannot send private reply — sender unknown.',
		};
	}
	return { ok: true, to: message.senderMemberId };
}
