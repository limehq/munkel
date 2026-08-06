import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTCH_FULL_MS, NOTCH_HISTORY_MS, NOTCH_RETRACT_AT_MS, type NotchPhase } from './notch-phase';
import { pruneNotchHistory } from './prune-notch-history';
import { copyAvifBase64ToClipboardAsPng } from './copy-image-to-clipboard';
import type { NotchMessage } from '../../shared/types';

export interface NotchHistoryEntry extends NotchMessage {
	id: string;
}

export type NotchUiState = 'collapsed' | 'preview' | 'open';

const HOVER_LEAVE_DELAY_MS = 150;
/** Failsafe when Windows drops mouseleave under click-through. */
export const HOVER_CEILING_MS = 8_000;
const EMPTY_HIDE_DELAY_MS = 350;
const COPY_FEEDBACK_MS = 1_500;
const PRUNE_INTERVAL_MS = 1_000;

let notchIdCounter = 0;

function nextNotchId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${notchIdCounter++}`;
}

export interface UseNotchLifecycleReturn {
	history: NotchHistoryEntry[];
	newest: NotchHistoryEntry | null;
	phase: NotchPhase;
	ui: NotchUiState;
	previewing: boolean;
	reopening: boolean;
	replyOpen: boolean;
	replyingTo: string | null;
	copiedId: string | null;
	/** Unread indicator dot (Plan 12 P3.3): true once the current message has
	 * retracted without the user ever hovering or opening a reply for it. */
	unread: boolean;
	setHovering: (value: boolean) => void;
	openReply: (entry: NotchHistoryEntry) => void;
	closeReply: () => void;
	onNotchMessage: (message: NotchMessage) => void;
	copyText: (entry: NotchHistoryEntry, fullImageBase64?: string) => void;
	scheduleHoverLeave: () => void;
	cancelHoverLeave: () => void;
	reopenFromHoverTarget: () => void;
	openFromPreview: () => void;
}

export function useNotchLifecycle(options?: { onNotchHide?: () => void }): UseNotchLifecycleReturn {
	const [history, setHistory] = useState<NotchHistoryEntry[]>([]);
	const [phase, setPhase] = useState<NotchPhase>('retracted');
	const [ui, setUi] = useState<NotchUiState>('collapsed');
	const [hovering, setHovering] = useState(false);
	const [replyingTo, setReplyingTo] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	// Unread indicator dot (Plan 12 P3.3): whether the user has interacted
	// with the *current* newest message. Reset to false in `onNotchMessage`
	// whenever a new message arrives. Exactly two paths flip it true:
	// `reopenFromHoverTarget` (hovering the sliver's hover-target to reopen)
	// and `openReply` (the reply button or a message-body click; sending a
	// reply necessarily passes through `openReply` first, so "send" is
	// covered transitively). Note that a bare `setHovering(true)` — e.g. the
	// currently-idle `notch-reopen` push fallback — does NOT count as an
	// interaction. The exposed `unread` flag is derived (see below), not
	// stored, so it cannot go stale relative to `phase`/`newest`.
	const [interacted, setInteracted] = useState(false);

	const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const leaveHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pointerInsideRef = useRef(false);
	const leaveSuppressedRef = useRef(false);
	const historyRef = useRef(history);
	historyRef.current = history;

	const newest = history[0] ?? null;
	const reopening = ui === 'open';
	const previewing = ui === 'preview';
	const replyOpen = replyingTo !== null;
	// A dot only makes sense once the notch has actually retracted with an
	// unread message sitting behind it — not while it's still visible
	// (full/peek) or reopened for viewing.
	const unread = phase === 'retracted' && !!newest && !interacted;

	const cancelHoverLeave = useCallback(() => {
		pointerInsideRef.current = true;
		leaveSuppressedRef.current = false;
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
			leaveHoverTimer.current = null;
		}
	}, []);

	const collapseUiSoon = useCallback(() => {
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
		}
		leaveHoverTimer.current = setTimeout(() => {
			setUi('collapsed');
			setHovering(false);
			leaveHoverTimer.current = null;
		}, HOVER_LEAVE_DELAY_MS);
	}, []);

	const scheduleHoverLeave = useCallback(() => {
		pointerInsideRef.current = false;
		// Don't collapse while the reply field is open — remember the leave so
		// closeReply can re-arm once the reply ends.
		if (replyOpen) {
			leaveSuppressedRef.current = true;
			return;
		}
		leaveSuppressedRef.current = false;
		collapseUiSoon();
	}, [replyOpen, collapseUiSoon]);

	const openFromPreview = useCallback(() => {
		cancelHoverLeave();
		setUi('open');
		setHovering(true);
		setInteracted(true);
	}, [cancelHoverLeave]);

	const reopenFromHoverTarget = useCallback(() => {
		if (history.length === 0 || phase === 'full') return;
		cancelHoverLeave();
		setUi('preview');
		setInteracted(true);
	}, [history.length, phase, cancelHoverLeave]);

	const openReply = useCallback((entry: NotchHistoryEntry) => {
		setReplyingTo(entry.id);
		setInteracted(true);
	}, []);

	const closeReply = useCallback(() => {
		setReplyingTo(null);
		// Re-arm a leave that was suppressed while replyOpen was true.
		if (leaveSuppressedRef.current && !pointerInsideRef.current) {
			leaveSuppressedRef.current = false;
			collapseUiSoon();
		} else {
			leaveSuppressedRef.current = false;
		}
	}, [collapseUiSoon]);

	/**
	 * Copy an entry's content (Plan 14 task 7: prefer full-res image). When
	 * the caller has a loaded full-resolution image for this entry's first
	 * picture, try to copy THAT to the clipboard (mirroring macOS's
	 * image-copy path); any failure — unsupported clipboard API, decode
	 * error — falls back to the existing text-only copy rather than doing
	 * nothing. Entries without a loaded image (no `fullImageBase64`) copy
	 * text exactly as before.
	 */
	const copyText = useCallback((entry: NotchHistoryEntry, fullImageBase64?: string) => {
		if (fullImageBase64) {
			void copyAvifBase64ToClipboardAsPng(fullImageBase64).catch(() => {
				void navigator.clipboard.writeText(entry.text);
			});
		} else {
			void navigator.clipboard.writeText(entry.text);
		}
		setCopiedId(entry.id);
	}, []);

	const onNotchMessage = useCallback((message: NotchMessage) => {
		const entry: NotchHistoryEntry = {
			...message,
			id: nextNotchId(),
			receivedAt: message.receivedAt ?? new Date().toISOString(),
		};
		setHistory((current) => pruneNotchHistory([entry, ...current], Date.now(), NOTCH_HISTORY_MS));
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
			leaveHoverTimer.current = null;
		}
		leaveSuppressedRef.current = false;
		pointerInsideRef.current = false;
		setUi('collapsed');
		setHovering(false);
		closeReply();
		// A new message is unread until the user interacts with it again.
		setInteracted(false);
	}, [closeReply]);

	// Phase lifecycle: FULL → PEEK → RETRACTED for each new newest message.
	// Silent messages skip the full preview and go straight to peek (ring/sliver).
	useEffect(() => {
		phaseTimers.current.forEach(clearTimeout);
		phaseTimers.current = [];

		if (!newest) {
			setPhase('retracted');
			return;
		}

		if (newest.silent) {
			setPhase('peek');
			const retractTimer = setTimeout(() => setPhase('retracted'), NOTCH_RETRACT_AT_MS - NOTCH_FULL_MS);
			phaseTimers.current = [retractTimer];
		} else {
			setPhase('full');
			const fullTimer = setTimeout(() => setPhase('peek'), NOTCH_FULL_MS);
			const retractTimer = setTimeout(() => setPhase('retracted'), NOTCH_RETRACT_AT_MS);
			phaseTimers.current = [fullTimer, retractTimer];
		}

		return () => {
			phaseTimers.current.forEach(clearTimeout);
			phaseTimers.current = [];
		};
	}, [newest?.id]);

	// Prune history every second so old entries drop after 60 s.
	useEffect(() => {
		const pruneTimer = setInterval(() => {
			setHistory((current) => {
				const pruned = pruneNotchHistory(current, Date.now(), NOTCH_HISTORY_MS);
				return pruned.length === current.length ? current : pruned;
			});
		}, PRUNE_INTERVAL_MS);
		return () => clearInterval(pruneTimer);
	}, []);

	// Main-process push listeners that affect lifecycle state.
	useEffect(() => {
		const removeShow = window.electronAPI.onNotchShow(() => {
			cancelHoverLeave();
		});
		const removeHide = window.electronAPI.onNotchHide(() => {
			leaveSuppressedRef.current = false;
			pointerInsideRef.current = false;
			setUi('collapsed');
			setHovering(false);
			closeReply();
			options?.onNotchHide?.();
		});
		const removeReopen = window.electronAPI.onNotchReopen(() => {
			if (historyRef.current.length > 0) {
				cancelHoverLeave();
				setUi('open');
				setHovering(true);
			}
		});
		return () => {
			removeShow();
			removeHide();
			removeReopen();
		};
	}, [cancelHoverLeave, closeReply, options?.onNotchHide]);

	// Reset UI when history empties so the notch collapses cleanly.
	useEffect(() => {
		if (history.length === 0) {
			setUi('collapsed');
			setHovering(false);
		}
	}, [history.length]);

	// Keep the notch window interactive whenever the user needs to interact with it.
	useEffect(() => {
		const interactive = !!newest && (phase === 'full' || ui !== 'collapsed' || replyOpen);
		void window.electronAPI.notchSetInteractive(interactive);
	}, [newest?.id, phase, ui, replyOpen]);

	// Defensive ceiling: if mouseleave is dropped under click-through, clear
	// expanded UI so phase-driven peek/retract can take over again.
	useEffect(() => {
		if (ui === 'collapsed' || replyOpen) return;
		if (phase !== 'peek' && phase !== 'retracted') return;
		const ceiling = setTimeout(() => {
			setUi('collapsed');
			setHovering(false);
		}, HOVER_CEILING_MS);
		return () => clearTimeout(ceiling);
	}, [ui, replyOpen, phase]);

	// Hide the notch window once the buffer has been empty briefly.
	// NOTE: This is intentionally NOT gated on `ui`. On Windows the renderer
	// may never receive a `mouseleave` after `setIgnoreMouseEvents(true, { forward: true })`,
	// which would keep the UI stuck and prevent the notch from ever hiding.
	useEffect(() => {
		if (history.length > 0) return;
		const emptyTimer = setTimeout(() => {
			void window.electronAPI.notchEmpty();
		}, EMPTY_HIDE_DELAY_MS);
		return () => clearTimeout(emptyTimer);
	}, [history.length]);

	// Hover-leave and copy-feedback timer cleanup.
	useEffect(() => {
		return () => {
			if (leaveHoverTimer.current) {
				clearTimeout(leaveHoverTimer.current);
				leaveHoverTimer.current = null;
			}
			if (copyFeedbackTimer.current) {
				clearTimeout(copyFeedbackTimer.current);
				copyFeedbackTimer.current = null;
			}
		};
	}, []);

	// Reset copied feedback after COPY_FEEDBACK_MS.
	useEffect(() => {
		if (!copiedId) return;
		if (copyFeedbackTimer.current) {
			clearTimeout(copyFeedbackTimer.current);
		}
		copyFeedbackTimer.current = setTimeout(() => {
			setCopiedId(null);
			copyFeedbackTimer.current = null;
		}, COPY_FEEDBACK_MS);
		return () => {
			if (copyFeedbackTimer.current) {
				clearTimeout(copyFeedbackTimer.current);
			}
		};
	}, [copiedId]);

	return {
		history,
		newest,
		phase,
		ui,
		previewing,
		reopening,
		replyOpen,
		replyingTo,
		copiedId,
		unread,
		setHovering,
		openReply,
		closeReply,
		onNotchMessage,
		copyText,
		scheduleHoverLeave,
		cancelHoverLeave,
		reopenFromHoverTarget,
		openFromPreview,
	};
}
