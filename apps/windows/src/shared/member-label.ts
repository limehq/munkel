/** Member-like shape for display labeling (macOS `GroupSession.Member.label`). */
export interface MemberLabelInput {
	memberId: string;
	displayName?: string | null;
}

/**
 * Human-readable label for a circle member.
 *
 * Mirrors macOS `GroupSession.Member.label`: prefer the display name, otherwise
 * the first 8 characters of the member id (never the full UUID in the UI).
 */
export function memberLabel(member: MemberLabelInput): string {
	const name = member.displayName?.trim();
	if (name) return name;
	return member.memberId.slice(0, 8);
}
