export interface ShouldOpenReplyParams {
	/** Reply compose field is already open. */
	replying: boolean;
	/** A non-empty text selection exists inside the message body. */
	hasTextSelection: boolean;
	/** Pixel distance between pointerdown and click (drag → select-to-copy). */
	pointerMovedPx: number;
	/** Drag distances above this are treated as a selection gesture, not a click. */
	dragThresholdPx?: number;
}

const DEFAULT_DRAG_THRESHOLD_PX = 6;

/**
 * Decide whether a click on the notch message body should open the reply
 * compose field. Pure (no DOM/React) so the decision logic is unit-testable —
 * the DOM wiring in NotchWidget only reads pointer/selection state and defers
 * here. Mirrors `resolve-reply-recipient.ts`.
 *
 * Fail-closed on any signal that the user was selecting text (drag distance or
 * an existing selection) so click-to-reply never hijacks a select-to-copy
 * gesture. Addresses the "global getSelection is unreliable" review note by
 * combining a scoped selection check with pointer-drag intent.
 */
export function shouldOpenReplyOnMessageClick(params: ShouldOpenReplyParams): boolean {
	if (params.replying) return false;
	if (params.hasTextSelection) return false;
	if (params.pointerMovedPx > (params.dragThresholdPx ?? DEFAULT_DRAG_THRESHOLD_PX)) return false;
	return true;
}
