import { describe, expect, it } from 'bun:test';
import { focusNotchForReply, unfocusNotchAfterReply } from '../notch-focus';

function mockNotchWindow(): {
	setFocusable(value: boolean): void;
	show(): void;
	focus(): void;
	blur(): void;
	calls: string[];
} {
	const calls: string[] = [];
	return {
		calls,
		setFocusable: (value: boolean) => {
			calls.push(`setFocusable:${value}`);
		},
		show: () => {
			calls.push('show');
		},
		focus: () => {
			calls.push('focus');
		},
		blur: () => {
			calls.push('blur');
		},
	};
}

describe('notch-focus', () => {
	it('focusNotchForReply enables focus and activates the window', () => {
		const win = mockNotchWindow();
		focusNotchForReply(win);
		expect(win.calls).toEqual(['setFocusable:true', 'show', 'focus']);
	});

	it('unfocusNotchAfterReply blurs and restores non-focusable state', () => {
		const win = mockNotchWindow();
		unfocusNotchAfterReply(win);
		expect(win.calls).toEqual(['blur', 'setFocusable:false']);
	});

	it('focus/unfocus helpers are no-ops for null', () => {
		expect(() => focusNotchForReply(null)).not.toThrow();
		expect(() => unfocusNotchAfterReply(null)).not.toThrow();
	});
});
