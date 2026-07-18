import { useEffect, useState } from 'react';
import type { IncomingImage } from '../../shared/types';

export interface ImagePreviewOverlayProps {
	/** `id` (r2Key) of the image being previewed — used as the card's `key` so an album hand-off cross-fades instead of reusing stale layout. */
	previewImageID: string;
	image: IncomingImage;
	/** Decrypted full-resolution bytes, base64-encoded, once loaded — `null` while pending or failed. */
	fullDataBase64: string | null;
	/** True once the main-process fetch for this image has failed. */
	failed: boolean;
	/** Current notch content height (px) — the gutter on each side is `max(notchHeight, 24)`, mirroring `MessageDisplayModel.notchSize`. */
	notchHeight: number;
}

const MIN_FITTED_DIMENSION_PX = 80;
const MIN_GUTTER_PX = 24;

/**
 * Fit `image`'s native pixel size into `available` (the window's client
 * area) minus a `max(notchHeight, 24)` gutter on each axis, capped at scale 1
 * so a small image never gets blown up past its own resolution — mirrors
 * macOS `PreviewCard.fittedSize`.
 */
export function fittedPreviewSize(
	image: Pick<IncomingImage, 'width' | 'height'>,
	available: { width: number; height: number },
	notchHeight: number,
): { width: number; height: number } {
	const w = Math.max(image.width, 1);
	const h = Math.max(image.height, 1);
	const gutter = Math.max(notchHeight, MIN_GUTTER_PX);
	const maxW = Math.max(MIN_FITTED_DIMENSION_PX, available.width - 2 * gutter);
	const maxH = Math.max(MIN_FITTED_DIMENSION_PX, available.height - 2 * gutter);
	const scale = Math.min(maxW / w, maxH / h, 1);
	return { width: Math.max(1, w * scale), height: Math.max(1, h * scale) };
}

/**
 * The large centered Quick-Look card + dimmed backdrop, mirroring macOS
 * `ImagePreviewOverlay.swift`. Rendered as a full-window sibling of
 * `.notch-widget` only while `previewImageID` is set (see `NotchWidget.tsx`);
 * `pointer-events: none` throughout (see `global.css`) so it never steals
 * hover/click from the thumbs underneath.
 */
export default function ImagePreviewOverlay({
	previewImageID,
	image,
	fullDataBase64,
	failed,
	notchHeight,
}: ImagePreviewOverlayProps) {
	const [available, setAvailable] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

	useEffect(() => {
		const onResize = () => setAvailable({ width: window.innerWidth, height: window.innerHeight });
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);

	const size = fittedPreviewSize(image, available, notchHeight);
	// Progressive: the inline thumbnail shows immediately (cross-faded in via
	// CSS), swapped for the full-resolution bytes once the main process's
	// download+decrypt resolves — mirrors macOS decoding the thumb first,
	// then the full image once `fullImages[id]` appears.
	const loading = !fullDataBase64 && !failed;
	const src = `data:image/avif;base64,${fullDataBase64 ?? image.thumb}`;

	return (
		<div className="image-preview-overlay" data-testid="image-preview-overlay">
			<div className="image-preview-backdrop" />
			<div key={previewImageID} className="image-preview-card" style={{ width: size.width, height: size.height }}>
				<img className="image-preview-card-img" src={src} alt="" />
				{loading && <div className="image-preview-spinner" data-testid="image-preview-spinner" aria-hidden="true" />}
				{failed && !fullDataBase64 && (
					<div className="image-preview-fail" data-testid="image-preview-fail" role="img" aria-label="Failed to load full-resolution image">
						⚠
					</div>
				)}
			</div>
		</div>
	);
}
