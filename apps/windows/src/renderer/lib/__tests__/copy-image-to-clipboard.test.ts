import { describe, expect, it, afterEach } from 'bun:test';
import { copyAvifBase64ToClipboardAsPng } from '../copy-image-to-clipboard';

type Globals = Record<string, unknown>;
const g = globalThis as unknown as Globals;

/** Snapshot/restore the handful of DOM globals this module touches, so tests don't leak into each other. */
const KEYS = ['ClipboardItem', 'navigator', 'document', 'Image'];
function snapshotGlobals(): Globals {
	const snap: Globals = {};
	for (const key of KEYS) snap[key] = g[key];
	return snap;
}
function restoreGlobals(snap: Globals): void {
	for (const key of KEYS) {
		if (snap[key] === undefined) delete g[key];
		else g[key] = snap[key];
	}
}

class FakeImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	naturalWidth = 4;
	naturalHeight = 3;
	width = 4;
	height = 3;
	private _src = '';
	get src(): string {
		return this._src;
	}
	set src(value: string) {
		this._src = value;
		if (FakeImage.shouldFail) {
			this.onerror?.();
		} else {
			this.onload?.();
		}
	}
	static shouldFail = false;
}

function installHappyDom(options?: { getContext?: () => unknown; toBlobResult?: Blob | null }): {
	writtenItems: ClipboardItem[];
} {
	const writtenItems: ClipboardItem[] = [];
	const fakeCanvas = {
		width: 0,
		height: 0,
		getContext:
			options?.getContext ??
			(() => ({
				drawImage: () => {},
			})),
		toBlob: (cb: (blob: Blob | null) => void) => {
			cb(options?.toBlobResult !== undefined ? options.toBlobResult : new Blob(['png-bytes'], { type: 'image/png' }));
		},
	};

	g.ClipboardItem = class ClipboardItem {
		constructor(public items: Record<string, Blob>) {}
	} as unknown as typeof ClipboardItem;
	g.navigator = {
		clipboard: {
			write: (items: ClipboardItem[]) => {
				writtenItems.push(...items);
				return Promise.resolve();
			},
		},
	};
	g.document = {
		createElement: (tag: string) => {
			if (tag !== 'canvas') throw new Error(`unexpected element: ${tag}`);
			return fakeCanvas;
		},
	};
	g.Image = FakeImage as unknown as typeof Image;

	return { writtenItems };
}

describe('copyAvifBase64ToClipboardAsPng', () => {
	afterEach(() => {
		FakeImage.shouldFail = false;
	});

	it('re-encodes the AVIF through canvas and writes a single image/png ClipboardItem', async () => {
		const snap = snapshotGlobals();
		try {
			const { writtenItems } = installHappyDom();

			await copyAvifBase64ToClipboardAsPng('QUJDRA==');

			expect(writtenItems).toHaveLength(1);
			expect(Object.keys((writtenItems[0] as unknown as { items: Record<string, Blob> }).items)).toEqual([
				'image/png',
			]);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('rejects when the Async Clipboard API (ClipboardItem) is unavailable', async () => {
		const snap = snapshotGlobals();
		try {
			delete g.ClipboardItem;
			g.navigator = { clipboard: { write: () => Promise.resolve() } };

			await expect(copyAvifBase64ToClipboardAsPng('QUJDRA==')).rejects.toThrow(/unsupported/i);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('rejects when navigator.clipboard.write is unavailable', async () => {
		const snap = snapshotGlobals();
		try {
			g.ClipboardItem = class ClipboardItem {} as unknown as typeof ClipboardItem;
			g.navigator = { clipboard: {} };

			await expect(copyAvifBase64ToClipboardAsPng('QUJDRA==')).rejects.toThrow(/unsupported/i);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('rejects when the DOM Image/document APIs are unavailable (non-browser environment)', async () => {
		const snap = snapshotGlobals();
		try {
			g.ClipboardItem = class ClipboardItem {} as unknown as typeof ClipboardItem;
			g.navigator = { clipboard: { write: () => Promise.resolve() } };
			delete g.document;
			delete g.Image;

			await expect(copyAvifBase64ToClipboardAsPng('QUJDRA==')).rejects.toThrow(/DOM image decode unavailable/);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('rejects when the AVIF fails to decode (Image onerror fires)', async () => {
		const snap = snapshotGlobals();
		try {
			installHappyDom();
			FakeImage.shouldFail = true;

			await expect(copyAvifBase64ToClipboardAsPng('not-a-real-avif')).rejects.toThrow(/decode failed/i);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('rejects when a 2D canvas context is unavailable', async () => {
		const snap = snapshotGlobals();
		try {
			installHappyDom({ getContext: () => null });

			await expect(copyAvifBase64ToClipboardAsPng('QUJDRA==')).rejects.toThrow(/2D canvas context/);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('rejects when canvas.toBlob yields no blob', async () => {
		const snap = snapshotGlobals();
		try {
			installHappyDom({ toBlobResult: null });

			await expect(copyAvifBase64ToClipboardAsPng('QUJDRA==')).rejects.toThrow(/toBlob returned null/);
		} finally {
			restoreGlobals(snap);
		}
	});

	it('does not call clipboard.write when the decode fails', async () => {
		const snap = snapshotGlobals();
		try {
			const { writtenItems } = installHappyDom();
			FakeImage.shouldFail = true;

			await expect(copyAvifBase64ToClipboardAsPng('bad')).rejects.toThrow();
			expect(writtenItems).toHaveLength(0);
		} finally {
			restoreGlobals(snap);
		}
	});
});
