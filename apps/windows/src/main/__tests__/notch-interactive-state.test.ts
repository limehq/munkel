import { describe, expect, it, beforeEach } from 'bun:test';
import {
	setNotchInteractive,
	setPreviewActive,
	syncNotchMouseInteractiveState,
} from '../notch-interactive-state';

function mockNotchWindow(initial: { ignore?: boolean; destroyed?: boolean } = {}) {
	const calls: Array<[string, ...unknown[]]> = [];
	let ignoreMouseEvents = initial.ignore ?? true;
	return {
		calls,
		isDestroyed: () => initial.destroyed ?? false,
		setIgnoreMouseEvents: (value: boolean, opts?: { forward: boolean }) => {
			ignoreMouseEvents = value;
			calls.push(['setIgnoreMouseEvents', value, opts]);
		},
		isIgnoreMouseEvents: () => ignoreMouseEvents,
	};
}

describe('notch-interactive-state', () => {
	beforeEach(() => {
		setNotchInteractive(false);
		setPreviewActive(false);
	});

	it('enables click-through when neither interactive nor preview-active', () => {
		const win = mockNotchWindow();
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);
		expect(win.calls).toContainEqual(['setIgnoreMouseEvents', true, { forward: true }]);
	});

	it('keeps the window hittable while the user is interacting with the notch', () => {
		const win = mockNotchWindow();
		setNotchInteractive(true);
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);
		expect(win.calls).toContainEqual(['setIgnoreMouseEvents', false, { forward: true }]);
	});

	it('keeps the window hittable while a preview overlay is active, even if interactive is false', () => {
		const win = mockNotchWindow();
		setNotchInteractive(false);
		setPreviewActive(true);
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);
		expect(win.calls).toContainEqual(['setIgnoreMouseEvents', false, { forward: true }]);
	});

	it('resyncs to click-through after the preview ends and interaction stops', () => {
		const win = mockNotchWindow();
		setNotchInteractive(true);
		setPreviewActive(true);
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);
		expect(win.isIgnoreMouseEvents()).toBe(false);

		setPreviewActive(false);
		setNotchInteractive(false);
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);

		expect(win.isIgnoreMouseEvents()).toBe(true);
	});

	it('keeps the window hittable when a preview ends while the user is still interacting', () => {
		const win = mockNotchWindow();
		setNotchInteractive(true);
		setPreviewActive(true);
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);
		expect(win.isIgnoreMouseEvents()).toBe(false);

		setPreviewActive(false);
		syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow);

		expect(win.isIgnoreMouseEvents()).toBe(false);
		expect(win.calls.at(-1)).toEqual(['setIgnoreMouseEvents', false, { forward: true }]);
	});

	it('is a no-op when the window is null', () => {
		expect(() => syncNotchMouseInteractiveState(null)).not.toThrow();
	});

	it('is a no-op when the window is destroyed', () => {
		const win = mockNotchWindow({ destroyed: true });
		expect(() => syncNotchMouseInteractiveState(win as unknown as Electron.BrowserWindow)).not.toThrow();
		expect(win.calls).toHaveLength(0);
	});
});
