import { describe, expect, it } from 'bun:test';
import type { IncomingImage } from '../../../shared/types';
import {
	notchPreviewWidensWindow,
	resolveHoveredPreviewImage,
	resolveNotchPreviewOwner,
} from '../resolve-notch-preview-owner';

const imgA: IncomingImage = { id: 'img-a', width: 10, height: 10, thumb: 'AAA', mime: 'image/avif' };
const imgB: IncomingImage = { id: 'img-b', width: 20, height: 20, thumb: 'BBB', mime: 'image/avif' };

const history = [
	{ images: [imgA, imgB] },
	{ images: [] },
];

describe('resolveHoveredPreviewImage', () => {
	it('returns null when no hover id is set', () => {
		expect(resolveHoveredPreviewImage(history, null)).toBeNull();
	});

	it('finds the hovered image across current and history albums', () => {
		expect(resolveHoveredPreviewImage(history, 'img-b')).toEqual(imgB);
	});

	it('returns null when the hover id is not in history', () => {
		expect(resolveHoveredPreviewImage(history, 'missing')).toBeNull();
	});
});

describe('resolveNotchPreviewOwner', () => {
	it('gives the click lightbox exclusive ownership when it is open', () => {
		expect(
			resolveNotchPreviewOwner({ clickLightboxOpen: true, hoveredPreviewImage: imgA }),
		).toBe('click-lightbox');
	});

	it('gives the hover overlay ownership when the lightbox is closed and a hovered image resolved', () => {
		expect(
			resolveNotchPreviewOwner({ clickLightboxOpen: false, hoveredPreviewImage: imgA }),
		).toBe('hover-overlay');
	});

	it('owns nothing when the lightbox is closed and no hovered image resolved', () => {
		expect(
			resolveNotchPreviewOwner({ clickLightboxOpen: false, hoveredPreviewImage: null }),
		).toBe('none');
	});
});

describe('notchPreviewWidensWindow', () => {
	it('widens only when a surface will paint', () => {
		expect(notchPreviewWidensWindow('none')).toBe(false);
		expect(notchPreviewWidensWindow('hover-overlay')).toBe(true);
		expect(notchPreviewWidensWindow('click-lightbox')).toBe(true);
	});
});
