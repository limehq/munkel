import { useCallback, useEffect, useRef, useState } from 'react';
import {
	INITIAL_IMAGE_PREVIEW_STATE,
	PREVIEW_DEBOUNCE_MS,
	clearPreview,
	commitPreview,
	endPreview,
	requestPreview,
	type ImagePreviewState,
} from './image-preview-state';

export interface UseImagePreviewReturn {
	/** `id` (r2Key) of the image currently shown in the large preview card, or `null`. */
	previewImageID: string | null;
	/** `id` (r2Key) the pointer is currently over, or `null`. Used by hover-"C" copy to pick which image to copy. */
	hoveredImageID: string | null;
	/** Hover entered a thumb — debounces the first show, hands off instantly while a card is already up. */
	requestPreview: (id: string) => void;
	/** Hover left a thumb — owner-checked, so an adjacent cell's enter isn't undone. */
	endPreview: (id: string) => void;
	/** Hard clear for every teardown path (notch hide, reply open, notch mouseleave). */
	clearPreview: () => void;
}

/**
 * Owns the 180ms first-show debounce timer for the image Quick-Look preview
 * (Plan 14), delegating the actual state transitions to the pure functions in
 * `image-preview-state.ts` so the debounce/hand-off/owner-check semantics stay
 * unit-testable independent of React.
 */
export function useImagePreview(): UseImagePreviewReturn {
	const [state, setState] = useState<ImagePreviewState>(INITIAL_IMAGE_PREVIEW_STATE);
	const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cancelDebounce = useCallback(() => {
		if (debounceTimer.current) {
			clearTimeout(debounceTimer.current);
			debounceTimer.current = null;
		}
	}, []);

	const request = useCallback(
		(id: string) => {
			cancelDebounce();
			setState((current) => {
				const result = requestPreview(current, id);
				if (result.scheduleDebounce) {
					debounceTimer.current = setTimeout(() => {
						debounceTimer.current = null;
						setState((latest) => commitPreview(latest, id));
					}, PREVIEW_DEBOUNCE_MS);
				}
				return result.state;
			});
		},
		[cancelDebounce],
	);

	const end = useCallback(
		(id: string) => {
			cancelDebounce();
			setState((current) => endPreview(current, id));
		},
		[cancelDebounce],
	);

	const clear = useCallback(() => {
		cancelDebounce();
		setState(clearPreview);
	}, [cancelDebounce]);

	// Cancel any pending debounce on unmount so it can't fire setState after
	// teardown.
	useEffect(() => cancelDebounce, [cancelDebounce]);

	return {
		previewImageID: state.previewImageID,
		hoveredImageID: state.hoveredImageID,
		requestPreview: request,
		endPreview: end,
		clearPreview: clear,
	};
}
