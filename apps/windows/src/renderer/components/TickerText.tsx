import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Single-line horizontal-scroll message teaser, mirroring macOS
 * `TickerText.swift`: the text starts fully visible, stands still for
 * `START_DELAY_MS` (long enough to catch the first words), scrolls
 * left-to-right exactly once at `PIXELS_PER_SECOND`, then stops at the end
 * with `END_PADDING_PX` of trailing clearance. Text that already fits the
 * available width is rendered statically — no animation, no edge fade.
 *
 * Width calibration (Plan 13 item 7): unlike macOS, which hardcodes a
 * `windowWidth` prop (190pt default / 250pt in the notch), this component
 * measures its OWN rendered container width at runtime via refs. Mounted
 * inside `.message-body` (`flex: 1; min-width: 0`), that container already
 * reflects the actual Windows notch content width (280px minus padding,
 * the avatar, and the meta row) after flexbox layout — so there is no
 * magic-number width to keep in sync with `global.css` separately.
 */

const START_DELAY_MS = 1_600;
const PIXELS_PER_SECOND = 24;
const END_PADDING_PX = 14;

export interface TickerTextProps {
	text: string;
	className?: string;
	/** Fires exactly once: immediately for static text, or once the scroll finishes for overflowing text. */
	onFinished?: () => void;
}

function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		// Some test/embedding environments implement matchMedia but throw on
		// unsupported query strings — treat that the same as "no preference".
		return false;
	}
}

export function TickerText({ text, className, onFinished }: TickerTextProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLSpanElement>(null);
	const finishedRef = useRef(false);
	// Always call the LATEST onFinished without needing it in effect
	// dependency arrays (which would re-run measurement/scheduling effects
	// on every parent re-render that passes a fresh inline callback).
	const onFinishedRef = useRef(onFinished);
	useEffect(() => {
		onFinishedRef.current = onFinished;
	}, [onFinished]);

	// Raw overflow in px (scrollWidth - clientWidth); null = fits, render
	// statically. Re-measured whenever `text` changes — a new message swaps
	// in fresh text needing a fresh measurement (in practice this component
	// also remounts fresh per message via the parent's `key`, but re-running
	// on `text` keeps this correct even if that ever changes).
	const [overflowPx, setOverflowPx] = useState<number | null>(null);
	const [scrolling, setScrolling] = useState(false);
	// Read once at mount — a live-updating media query isn't needed for a
	// component that itself remounts fresh per message.
	const [reduced] = useState(prefersReducedMotion);

	useLayoutEffect(() => {
		finishedRef.current = false;
		setScrolling(false);
		const container = containerRef.current;
		const span = textRef.current;
		const overflow = container && span ? span.scrollWidth - container.clientWidth : 0;
		const measured = overflow > 0 ? overflow : null;
		setOverflowPx(measured);

		// Decided HERE, synchronously with the real measurement — not in a
		// separate effect reacting to derived render state. The render that
		// precedes this layout effect always has `overflowPx === null`
		// (pre-measurement), which is indistinguishable from "genuinely
		// fits" to a plain `useEffect`; a naive `if (!willAnimate) fire()`
		// effect fires prematurely on that pre-measurement render for
		// overflowing text too (confirmed empirically while building this).
		const willAnimate = measured !== null && !reduced;
		if (!willAnimate) {
			// Fits statically, or reduced-motion truncation instead of
			// animating — "finished" immediately, mirroring macOS firing
			// onFinished from `.onAppear` on the non-scrolling branch.
			finishedRef.current = true;
			onFinishedRef.current?.();
		}
	}, [text, reduced]);

	const overflowing = overflowPx !== null;
	const willAnimate = overflowing && !reduced;

	// Standstill, then start the scroll. Only ever schedules once `overflowPx`
	// reflects the layout effect's real measurement (an early run against the
	// pre-measurement render just no-ops here; the deps change re-runs it).
	useEffect(() => {
		if (!willAnimate) return;
		const startTimer = setTimeout(() => setScrolling(true), START_DELAY_MS);
		return () => clearTimeout(startTimer);
	}, [willAnimate, text]);

	// Report completion once the scroll's CSS transition has had time to
	// finish (duration matches the inline `transitionDuration` set below).
	useEffect(() => {
		if (!scrolling || overflowPx === null) return;
		const durationMs = ((overflowPx + END_PADDING_PX) / PIXELS_PER_SECOND) * 1000;
		const doneTimer = setTimeout(() => {
			if (finishedRef.current) return;
			finishedRef.current = true;
			onFinishedRef.current?.();
		}, durationMs);
		return () => clearTimeout(doneTimer);
	}, [scrolling, overflowPx]);

	const offsetPx = scrolling && overflowPx !== null ? overflowPx + END_PADDING_PX : 0;
	const durationS = overflowPx !== null ? (overflowPx + END_PADDING_PX) / PIXELS_PER_SECOND : 0;

	const classes = ['ticker'];
	if (className) classes.push(className);
	if (overflowing) classes.push('ticker-overflowing');
	if (willAnimate) classes.push('ticker-scrolling');
	// Leading fade only once movement has actually begun (macOS: `offset > 0.5`).
	if (scrolling) classes.push('ticker-moving');
	if (overflowing && reduced) classes.push('ticker-static-truncated');

	return (
		<div ref={containerRef} className={classes.join(' ')} data-testid="ticker">
			<span
				ref={textRef}
				className="ticker-text"
				style={
					willAnimate
						? { transform: `translateX(-${offsetPx}px)`, transitionDuration: `${durationS}s` }
						: undefined
				}
			>
				{text}
			</span>
		</div>
	);
}

export default TickerText;
