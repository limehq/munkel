/**
 * Pure state transitions for the image Quick-Look hover preview (Plan 14 /
 * OQ4 macOS-parity overlay), mirroring macOS `MessageDisplayModel`'s
 * `requestPreview` / `endPreview` / `clearPreview` (see
 * `fp-notes/macos-image-preview-upstream/MessageNotchContainer.swift`).
 *
 * Kept side-effect-free (no timers) so the debounce semantics are unit
 * testable without React or fake-timer plumbing — `useImagePreview.ts` owns
 * the actual `setTimeout` and calls into these functions.
 */

export interface ImagePreviewState {
	/** `id` (r2Key) the pointer is currently over, or `null`. Set immediately on hover — no debounce. */
	hoveredImageID: string | null;
	/** `id` (r2Key) of the image currently shown in the large preview card, or `null`. Debounced on first show. */
	previewImageID: string | null;
}

export const INITIAL_IMAGE_PREVIEW_STATE: ImagePreviewState = {
	hoveredImageID: null,
	previewImageID: null,
};

/** First-show debounce (macOS: 180ms), mirrored exactly for hover-trigger parity. */
export const PREVIEW_DEBOUNCE_MS = 180;

export interface RequestPreviewResult {
	state: ImagePreviewState;
	/**
	 * `true` when the caller should schedule a `PREVIEW_DEBOUNCE_MS` timer
	 * that commits `id` via `commitPreview` unless superseded first. `false`
	 * when `state.previewImageID` already reflects `id` (instant hand-off —
	 * no debounce needed while a card is already showing).
	 */
	scheduleDebounce: boolean;
}

/**
 * Hover entered image `id`. Sets `hoveredImageID` immediately (no debounce —
 * used by the hover-"C" copy shortcut to know which picture to copy). If a
 * preview is already showing (sweeping across an album), the hand-off is
 * instant; otherwise the caller must debounce the first show.
 */
export function requestPreview(state: ImagePreviewState, id: string): RequestPreviewResult {
	if (state.previewImageID !== null) {
		return { state: { hoveredImageID: id, previewImageID: id }, scheduleDebounce: false };
	}
	return { state: { hoveredImageID: id, previewImageID: state.previewImageID }, scheduleDebounce: true };
}

/**
 * The debounce timer scheduled by `requestPreview` fired. Only commits if
 * `id` is still the hovered image — a fast leave (or a hand-off to another
 * cell) before the timer fires must not resurrect a stale preview.
 */
export function commitPreview(state: ImagePreviewState, id: string): ImagePreviewState {
	if (state.hoveredImageID !== id) return state;
	return { ...state, previewImageID: id };
}

/**
 * Hover left image `id`. Owner-checked on both fields so an adjacent cell's
 * `requestPreview` — which can land before this `endPreview` — is never
 * undone by it.
 */
export function endPreview(state: ImagePreviewState, id: string): ImagePreviewState {
	return {
		hoveredImageID: state.hoveredImageID === id ? null : state.hoveredImageID,
		previewImageID: state.previewImageID === id ? null : state.previewImageID,
	};
}

/**
 * Hard clear for every teardown path (notch hide, reply open, notch
 * mouseleave): drop the preview unconditionally, regardless of which cell
 * (if any) currently owns it.
 */
export function clearPreview(_state: ImagePreviewState): ImagePreviewState {
	return { hoveredImageID: null, previewImageID: null };
}
