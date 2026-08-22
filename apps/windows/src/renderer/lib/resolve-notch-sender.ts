import { memberLabel } from '../../shared/member-label';
import type { CircleState, IdentityState } from '../../shared/types';
import type { NotchHistoryEntry } from './useNotchLifecycle';

/**
 * Resolve the sender name shown in the notch for a history entry.
 *
 * `NotchMessage.sender` is captured at receive time and can be stale (e.g. a
 * full member id when the profile had not arrived yet). Prefer the live circle
 * roster from `state-update`, keyed by `senderMemberId`. Own identity is
 * resolved via `memberLabel` (displayName, else first 8 chars — never "You").
 */
export function resolveNotchSender(
	entry: NotchHistoryEntry,
	circles: CircleState[],
	identity?: Pick<IdentityState, 'memberId' | 'displayName'> | null,
): string {
	if (!entry.senderMemberId) return entry.sender;
	if (identity?.memberId && entry.senderMemberId === identity.memberId) {
		return memberLabel({ memberId: identity.memberId, displayName: identity.displayName });
	}
	const circle = circles.find((c) => c.code === entry.group);
	const member = circle?.members.find((m) => m.memberId === entry.senderMemberId);
	if (member) return memberLabel(member);
	return entry.sender;
}
