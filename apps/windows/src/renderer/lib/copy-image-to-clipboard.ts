/**
 * Best-effort "copy full-resolution picture" for the notch copy button /
 * hover-"C" shortcut (Plan 14 task 7), mirroring macOS's image-copy path
 * (`MessageDisplayModel.registerImageCopy` copying `fullImages[id]` when
 * loaded, else the thumb).
 *
 * The relay/crypto pipeline only ever produces AVIF bytes, but the Async
 * Clipboard API's `ClipboardItem` only reliably accepts `image/png` on
 * Windows/Chromium — so this decodes the cached AVIF through an offscreen
 * `<img>` + `<canvas>` and writes the re-encoded PNG. Any failure (missing
 * `ClipboardItem`/`clipboard.write` support, decode error, canvas failure)
 * rejects; callers should fall back to the existing text-only copy rather
 * than dropping the copy action entirely.
 */
export async function copyAvifBase64ToClipboardAsPng(base64: string): Promise<void> {
	if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
		throw new Error('Clipboard image write unsupported in this environment');
	}
	const pngBlob = await decodeAvifBase64ToPngBlob(base64);
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
}

function decodeAvifBase64ToPngBlob(base64: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		if (typeof document === 'undefined' || typeof Image === 'undefined') {
			reject(new Error('DOM image decode unavailable in this environment'));
			return;
		}
		const img = new Image();
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth || img.width;
				canvas.height = img.naturalHeight || img.height;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('2D canvas context unavailable'));
					return;
				}
				ctx.drawImage(img, 0, 0);
				canvas.toBlob((blob) => {
					if (blob) resolve(blob);
					else reject(new Error('Canvas toBlob returned null'));
				}, 'image/png');
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		};
		img.onerror = () => reject(new Error('AVIF decode failed'));
		img.src = `data:image/avif;base64,${base64}`;
	});
}
