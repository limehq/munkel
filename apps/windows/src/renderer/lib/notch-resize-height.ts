import type { NotchPhase } from './notch-phase';

/** Collapsed peek/retract BrowserWindow footprint (chrome / sliver only). */
export const NOTCH_COLLAPSED_HEIGHT_PX = 56;

/**
 * Height reported to main via notch-resize.
 * Peek/retract (not reopened, not replying) always use the collapsed footprint
 * so a tall post-hover window cannot mask retract — independent of message length.
 */
export function resolveNotchResizeHeight(args: {
	offsetHeight: number;
	historyLength: number;
	phase: NotchPhase;
	reopening: boolean;
	replyOpen: boolean;
	collapsedHeightPx?: number;
}): number {
	const collapsedPx = args.collapsedHeightPx ?? NOTCH_COLLAPSED_HEIGHT_PX;
	const collapsed =
		args.historyLength > 0 &&
		!args.reopening &&
		!args.replyOpen &&
		(args.phase === 'peek' || args.phase === 'retracted');
	return collapsed ? collapsedPx : args.offsetHeight;
}
