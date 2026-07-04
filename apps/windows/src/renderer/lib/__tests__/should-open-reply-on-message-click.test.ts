import { describe, expect, it } from 'bun:test';
import { shouldOpenReplyOnMessageClick } from '../should-open-reply-on-message-click';

const base = { replying: false, hasTextSelection: false, pointerMovedPx: 0 };

describe('shouldOpenReplyOnMessageClick', () => {
	it('opens reply on a plain (no-drag, no-selection) message click', () => {
		expect(shouldOpenReplyOnMessageClick(base)).toBe(true);
	});

	it('does not reopen while already replying', () => {
		expect(shouldOpenReplyOnMessageClick({ ...base, replying: true })).toBe(false);
	});

	it('does not hijack an active text selection', () => {
		expect(shouldOpenReplyOnMessageClick({ ...base, hasTextSelection: true })).toBe(false);
	});

	it('treats a drag beyond the threshold as a selection gesture, not a click', () => {
		expect(shouldOpenReplyOnMessageClick({ ...base, pointerMovedPx: 20 })).toBe(false);
	});

	it('still opens on a tiny sub-threshold pointer jitter', () => {
		expect(shouldOpenReplyOnMessageClick({ ...base, pointerMovedPx: 3 })).toBe(true);
	});

	it('honours a custom drag threshold', () => {
		expect(shouldOpenReplyOnMessageClick({ ...base, pointerMovedPx: 4, dragThresholdPx: 2 })).toBe(false);
	});
});
