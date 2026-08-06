import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { useImagePreview } from '../useImagePreview';

/**
 * Minimal fake timer, mirroring the one in `useNotchLifecycle.test.ts` — the
 * 180ms first-show debounce (`PREVIEW_DEBOUNCE_MS`) must be advanced
 * deterministically rather than via a real `setTimeout` wait.
 */
class FakeTimers {
	private now = 0;
	private nextId = 1;
	private readonly timers = new Map<number, { at: number; callback: () => void }>();
	private readonly original = {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
	};

	install(): void {
		globalThis.setTimeout = ((callback: () => void, delay?: number) => {
			const id = this.nextId++;
			this.timers.set(id, { at: this.now + Math.max(0, Number(delay ?? 0)), callback });
			return id as unknown as ReturnType<typeof setTimeout>;
		}) as typeof setTimeout;
		globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
			this.timers.delete(Number(id));
		}) as typeof clearTimeout;
	}

	advance(ms: number): void {
		const target = this.now + ms;
		while (true) {
			const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
			if (!next || next[1].at > target) break;
			this.timers.delete(next[0]);
			this.now = next[1].at;
			next[1].callback();
		}
		this.now = target;
	}

	restore(): void {
		this.timers.clear();
		globalThis.setTimeout = this.original.setTimeout;
		globalThis.clearTimeout = this.original.clearTimeout;
	}
}

function renderHook<T>(useHook: () => T) {
	const result = { current: null as T };
	function TestComponent() {
		result.current = useHook();
		return null;
	}
	const root = create(React.createElement(TestComponent));
	return { result, unmount: () => root.unmount() };
}

describe('useImagePreview', () => {
	let timers: FakeTimers;

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();
	});

	afterEach(() => {
		timers.restore();
	});

	it('starts with no hovered/previewed image', () => {
		const { result } = renderHook(useImagePreview);
		expect(result.current.hoveredImageID).toBeNull();
		expect(result.current.previewImageID).toBeNull();
	});

	it('sets hoveredImageID immediately on requestPreview, but only shows the preview card after the 180ms debounce', () => {
		const { result } = renderHook(useImagePreview);

		act(() => {
			result.current.requestPreview('img-1');
		});
		expect(result.current.hoveredImageID).toBe('img-1');
		expect(result.current.previewImageID).toBeNull();

		act(() => {
			timers.advance(179);
		});
		expect(result.current.previewImageID).toBeNull();

		act(() => {
			timers.advance(1);
		});
		expect(result.current.previewImageID).toBe('img-1');
	});

	it('does not show the preview if the pointer leaves before the debounce fires', () => {
		const { result } = renderHook(useImagePreview);

		act(() => {
			result.current.requestPreview('img-1');
		});
		act(() => {
			result.current.endPreview('img-1');
		});
		act(() => {
			timers.advance(180);
		});

		expect(result.current.hoveredImageID).toBeNull();
		expect(result.current.previewImageID).toBeNull();
	});

	it('hands off to a second image instantly (no debounce) once a card is already showing', () => {
		const { result } = renderHook(useImagePreview);

		act(() => {
			result.current.requestPreview('img-1');
			timers.advance(180);
		});
		expect(result.current.previewImageID).toBe('img-1');

		act(() => {
			result.current.requestPreview('img-2');
		});
		expect(result.current.previewImageID).toBe('img-2');
		expect(result.current.hoveredImageID).toBe('img-2');
	});

	it('endPreview is owner-checked: leaving a stale (already-superseded) id does not clear the current preview', () => {
		const { result } = renderHook(useImagePreview);

		act(() => {
			result.current.requestPreview('img-1');
			timers.advance(180);
			result.current.requestPreview('img-2');
		});
		expect(result.current.previewImageID).toBe('img-2');

		act(() => {
			result.current.endPreview('img-1');
		});
		expect(result.current.previewImageID).toBe('img-2');
	});

	it('clearPreview hard-resets both fields and cancels any pending debounce', () => {
		const { result } = renderHook(useImagePreview);

		act(() => {
			result.current.requestPreview('img-1');
		});
		act(() => {
			result.current.clearPreview();
		});
		act(() => {
			timers.advance(200);
		});

		expect(result.current.hoveredImageID).toBeNull();
		expect(result.current.previewImageID).toBeNull();
	});

	it('does not throw or leak a setState-after-unmount when the debounce timer is pending at unmount', () => {
		const { result, unmount } = renderHook(useImagePreview);

		act(() => {
			result.current.requestPreview('img-1');
		});
		unmount();

		expect(() => timers.advance(200)).not.toThrow();
	});
});
