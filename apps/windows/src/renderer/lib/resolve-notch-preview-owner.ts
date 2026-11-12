import type { IncomingImage } from '../../shared/types';

export type NotchPreviewOwner = 'none' | 'hover-overlay' | 'click-lightbox';

export function resolveHoveredPreviewImage(
	history: ReadonlyArray<{ images?: IncomingImage[] }>,
	hoveredImageId: string | null,
): IncomingImage | null {
	if (!hoveredImageId) return null;
	return history.flatMap((entry) => entry.images ?? []).find((img) => img.id === hoveredImageId) ?? null;
}

export function resolveNotchPreviewOwner(input: {
	clickLightboxOpen: boolean;
	hoveredPreviewImage: IncomingImage | null;
}): NotchPreviewOwner {
	if (input.clickLightboxOpen) return 'click-lightbox';
	if (input.hoveredPreviewImage) return 'hover-overlay';
	return 'none';
}

export function notchPreviewWidensWindow(owner: NotchPreviewOwner): boolean {
	return owner !== 'none';
}
