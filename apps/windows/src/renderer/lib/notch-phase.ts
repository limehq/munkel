export type NotchPhase = 'full' | 'peek' | 'retracted';

export const NOTCH_FULL_MS = 5_000;
export const NOTCH_PEEK_MS = 30_000;
export const NOTCH_RETRACT_AT_MS = NOTCH_FULL_MS + NOTCH_PEEK_MS;
export const NOTCH_HISTORY_MS = 60_000;

/** Phase of the newest notch message from elapsed local receive time. */
export function notchPhaseForElapsed(elapsedMs: number): NotchPhase {
	if (elapsedMs < NOTCH_FULL_MS) return 'full';
	if (elapsedMs < NOTCH_RETRACT_AT_MS) return 'peek';
	return 'retracted';
}
