import type { LastPaletteTarget } from '../../shared/types';

export interface PaletteRecipientSlot {
	circleCode: string;
	isEveryone: boolean;
	memberId?: string;
}

export function resolvePaletteStartIndex(
	recipients: readonly PaletteRecipientSlot[],
	remembered: LastPaletteTarget,
): number {
	if (remembered.channel === null) return 0;

	const exact = recipients.findIndex((r) =>
		r.circleCode === remembered.channel &&
		(remembered.member === null ? r.isEveryone : !r.isEveryone && r.memberId === remembered.member),
	);
	if (exact !== -1) return exact;

	const sameChannel = recipients.findIndex((r) => r.circleCode === remembered.channel);
	return sameChannel === -1 ? 0 : sameChannel;
}
