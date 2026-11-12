import { describe, expect, it } from 'bun:test';
import { NOTCH_COLLAPSED_HEIGHT_PX, resolveNotchResizeHeight } from '../notch-resize-height';

describe('resolveNotchResizeHeight', () => {
	it('uses content height in full phase', () => {
		expect(
			resolveNotchResizeHeight({
				offsetHeight: 180,
				historyLength: 1,
				phase: 'full',
				reopening: false,
				replyOpen: false,
			}),
		).toBe(180);
	});

	it('uses collapsed footprint in peek even if widget offsetHeight is tiny or huge', () => {
		expect(
			resolveNotchResizeHeight({
				offsetHeight: 12,
				historyLength: 1,
				phase: 'peek',
				reopening: false,
				replyOpen: false,
			}),
		).toBe(NOTCH_COLLAPSED_HEIGHT_PX);

		expect(
			resolveNotchResizeHeight({
				offsetHeight: 420,
				historyLength: 1,
				phase: 'peek',
				reopening: false,
				replyOpen: false,
			}),
		).toBe(NOTCH_COLLAPSED_HEIGHT_PX);
	});

	it('uses content height while reopened over peek', () => {
		expect(
			resolveNotchResizeHeight({
				offsetHeight: 320,
				historyLength: 3,
				phase: 'peek',
				reopening: true,
				replyOpen: false,
			}),
		).toBe(320);
	});

	it('uses content height while reply is open in retracted', () => {
		expect(
			resolveNotchResizeHeight({
				offsetHeight: 200,
				historyLength: 1,
				phase: 'retracted',
				replyOpen: true,
				reopening: false,
			}),
		).toBe(200);
	});
});
