import { describe, expect, it } from 'bun:test';
import { applyContentProtection, type ContentProtectionWindow } from '../content-protection';

function mockWindow(options?: { destroyed?: boolean; throws?: boolean }): {
	win: ContentProtectionWindow;
	calls: boolean[];
} {
	const calls: boolean[] = [];
	return {
		calls,
		win: {
			isDestroyed: () => options?.destroyed ?? false,
			setContentProtection: (enable: boolean) => {
				if (options?.throws) throw new Error('window mid-destroy');
				calls.push(enable);
			},
		},
	};
}

describe('applyContentProtection', () => {
	it('calls setContentProtection(true) on every window when allowInScreenshots is false', () => {
		const a = mockWindow();
		const b = mockWindow();
		applyContentProtection([a.win, b.win], false);
		expect(a.calls).toEqual([true]);
		expect(b.calls).toEqual([true]);
	});

	it('calls setContentProtection(false) on every window when allowInScreenshots is true', () => {
		const a = mockWindow();
		const b = mockWindow();
		applyContentProtection([a.win, b.win], true);
		expect(a.calls).toEqual([false]);
		expect(b.calls).toEqual([false]);
	});

	it('skips null/undefined entries (a window not yet created)', () => {
		const a = mockWindow();
		expect(() => applyContentProtection([a.win, null, undefined], false)).not.toThrow();
		expect(a.calls).toEqual([true]);
	});

	it('skips an already-destroyed window instead of calling setContentProtection on it', () => {
		const destroyed = mockWindow({ destroyed: true });
		const live = mockWindow();
		applyContentProtection([destroyed.win, live.win], false);
		expect(destroyed.calls).toEqual([]);
		expect(live.calls).toEqual([true]);
	});

	it('does not throw, and still applies to the remaining windows, when one window throws', () => {
		const throwing = mockWindow({ throws: true });
		const live = mockWindow();
		expect(() => applyContentProtection([throwing.win, live.win], false)).not.toThrow();
		expect(live.calls).toEqual([true]);
	});

	it('applies independently to menu/notch/palette-shaped triples, matching the main.ts call site', () => {
		const menu = mockWindow();
		const notch = mockWindow();
		const palette = mockWindow();
		applyContentProtection([menu.win, notch.win, palette.win], true);
		expect(menu.calls).toEqual([false]);
		expect(notch.calls).toEqual([false]);
		expect(palette.calls).toEqual([false]);
	});
});
