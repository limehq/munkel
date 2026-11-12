export type SkippedImage = { path: string; reason: string };

export type SendResult =
	| { ok: true; skipped?: SkippedImage[]; echoed?: true }
	| { ok: false; error: string; skipped?: SkippedImage[] };

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function fileTooLargeReason(path: string, size: number, maxBytes: number): string {
	return `File too large: ${path} (${formatBytes(size)}; max ${formatBytes(maxBytes)})`;
}

export function formatSkippedImages(skipped: SkippedImage[]): string {
	if (skipped.length === 0) return '';
	const lines = skipped.map((s) => `${s.path}: ${s.reason}`);
	return `Skipped ${skipped.length} image${skipped.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
}
