import { describe, expect, it } from 'bun:test';
import {
	INITIAL_IMAGE_PREVIEW_STATE,
	PREVIEW_DEBOUNCE_MS,
	clearPreview,
	commitPreview,
	endPreview,
	requestPreview,
	type ImagePreviewState,
} from '../image-preview-state';

describe('PREVIEW_DEBOUNCE_MS', () => {
	it('mirrors macOS MessageDisplayModel\'s 180ms first-show debounce', () => {
		expect(PREVIEW_DEBOUNCE_MS).toBe(180);
	});
});

describe('requestPreview', () => {
	it('sets hoveredImageID immediately but leaves previewImageID untouched, asking the caller to debounce, when no card is showing', () => {
		const result = requestPreview(INITIAL_IMAGE_PREVIEW_STATE, 'img-1');

		expect(result.state).toEqual({ hoveredImageID: 'img-1', previewImageID: null });
		expect(result.scheduleDebounce).toBe(true);
	});

	it('hands off instantly (no debounce) when a preview card is already showing (sweeping across an album)', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-1', previewImageID: 'img-1' };

		const result = requestPreview(state, 'img-2');

		expect(result.state).toEqual({ hoveredImageID: 'img-2', previewImageID: 'img-2' });
		expect(result.scheduleDebounce).toBe(false);
	});

	it('re-entering the same image while it is already previewed stays instant and idempotent', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-1', previewImageID: 'img-1' };

		const result = requestPreview(state, 'img-1');

		expect(result.state).toEqual({ hoveredImageID: 'img-1', previewImageID: 'img-1' });
		expect(result.scheduleDebounce).toBe(false);
	});
});

describe('commitPreview', () => {
	it('commits the debounced id into previewImageID when it is still the hovered image', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-1', previewImageID: null };

		const next = commitPreview(state, 'img-1');

		expect(next).toEqual({ hoveredImageID: 'img-1', previewImageID: 'img-1' });
	});

	it('does not resurrect a stale preview when the pointer left before the debounce fired', () => {
		// hoveredImageID is null (endPreview already ran) by the time the
		// timer fires — must not commit.
		const state: ImagePreviewState = { hoveredImageID: null, previewImageID: null };

		const next = commitPreview(state, 'img-1');

		expect(next).toEqual(state);
	});

	it('does not resurrect a stale preview when the pointer moved to a different image before the debounce fired', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-2', previewImageID: null };

		const next = commitPreview(state, 'img-1');

		expect(next).toEqual(state);
	});
});

describe('endPreview', () => {
	it('clears both fields when the leaving image owns them', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-1', previewImageID: 'img-1' };

		const next = endPreview(state, 'img-1');

		expect(next).toEqual({ hoveredImageID: null, previewImageID: null });
	});

	it('is owner-checked: an adjacent cell\'s requestPreview that already landed is not undone by a late endPreview for the old id', () => {
		// img-1's mouseleave fires after img-2's mouseenter already took over.
		const state: ImagePreviewState = { hoveredImageID: 'img-2', previewImageID: 'img-2' };

		const next = endPreview(state, 'img-1');

		expect(next).toEqual(state);
	});

	it('clears only hoveredImageID when a preview is still pending debounce for a different id', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-1', previewImageID: null };

		const next = endPreview(state, 'img-1');

		expect(next).toEqual({ hoveredImageID: null, previewImageID: null });
	});
});

describe('clearPreview', () => {
	it('unconditionally resets to the initial state regardless of current ownership', () => {
		const state: ImagePreviewState = { hoveredImageID: 'img-9', previewImageID: 'img-9' };

		expect(clearPreview(state)).toEqual({ hoveredImageID: null, previewImageID: null });
	});

	it('is a no-op-equivalent when already cleared', () => {
		expect(clearPreview(INITIAL_IMAGE_PREVIEW_STATE)).toEqual(INITIAL_IMAGE_PREVIEW_STATE);
	});
});
