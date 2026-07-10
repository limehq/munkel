import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTCH_FULL_MS, NOTCH_HISTORY_MS, NOTCH_RETRACT_AT_MS, type NotchPhase } from './notch-phase';
import { pruneNotchHistory } from './prune-notch-history';
import type { NotchMessage } from '../../shared/types';

export interface NotchHistoryEntry extends NotchMessage {
	id: string;
}

const HOVER_LEAVE_DELAY_MS = 150;
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
	hovering: boolean;
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
	copyText: (entry: NotchHistoryEntry) => void;
	scheduleHoverLeave: () => void;
	cancelHoverLeave: () => void;
	reopenFromHoverTarget: () => void;
}

export function useNotchLifecycle(options?: { onNotchHide?: () => void }): UseNotchLifecycleReturn {
	const [history, setHistory] = useState<NotchHistoryEntry[]>([]);
	const [phase, setPhase] = useState<NotchPhase>('retracted');
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
	const historyRef = useRef(history);
	historyRef.current = history;

	const newest = history[0] ?? null;
	const reopening = hovering;
	const replyOpen = replyingTo !== null;
	// A dot only makes sense once the notch has actually retracted with an
	// unread message sitting behind it — not while it's still visible
	// (full/peek) or reopened for viewing.
	const unread = phase === 'retracted' && !!newest && !interacted;

	const cancelHoverLeave = useCallback(() => {
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
			leaveHoverTimer.current = null;
		}
	}, []);

	const scheduleHoverLeave = useCallback(() => {
		if (replyOpen) return;
		cancelHoverLeave();
		leaveHoverTimer.current = setTimeout(() => {
			setHovering(false);
			leaveHoverTimer.current = null;
		}, HOVER_LEAVE_DELAY_MS);
	}, [replyOpen, cancelHoverLeave]);

	const reopenFromHoverTarget = useCallback(() => {
		if (history.length === 0) return;
		cancelHoverLeave();
		setHovering(true);
		setInteracted(true);
	}, [history.length, cancelHoverLeave]);

	const openReply = useCallback((entry: NotchHistoryEntry) => {
		setReplyingTo(entry.id);
		setInteracted(true);
	}, []);

	const closeReply = useCallback(() => {
		setReplyingTo(null);
	}, []);

	const copyText = useCallback((entry: NotchHistoryEntry) => {
		void navigator.clipboard.writeText(entry.text);
		setCopiedId(entry.id);
	}, []);

	const onNotchMessage = useCallback((message: NotchMessage) => {
		const entry: NotchHistoryEntry = {
			...message,
			id: nextNotchId(),
			receivedAt: message.receivedAt ?? new Date().toISOString(),
		};
		setHistory((current) => pruneNotchHistory([entry, ...current], Date.now(), NOTCH_HISTORY_MS));
		setHovering(false);
		cancelHoverLeave();
		closeReply();
		// A new message is unread until the user interacts with it again.
		setInteracted(false);
	}, [cancelHoverLeave, closeReply]);

	// Phase lifecycle: FULL → PEEK → RETRACTED for each new newest message.
	useEffect(() => {
		phaseTimers.current.forEach(clearTimeout);
		phaseTimers.current = [];

		if (!newest) {
			setPhase('retracted');
			return;
		}

		setPhase('full');
		const fullTimer = setTimeout(() => setPhase('peek'), NOTCH_FULL_MS);
		const retractTimer = setTimeout(() => setPhase('retracted'), NOTCH_RETRACT_AT_MS);
		phaseTimers.current = [fullTimer, retractTimer];

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
			setHovering(false);
			closeReply();
			options?.onNotchHide?.();
		});
		const removeReopen = window.electronAPI.onNotchReopen(() => {
			if (historyRef.current.length > 0) {
				setHovering(true);
			}
		});
		return () => {
			removeShow();
			removeHide();
			removeReopen();
		};
	}, [cancelHoverLeave, closeReply, options?.onNotchHide]);

	// Keep the notch window interactive whenever the user needs to interact with it.
	useEffect(() => {
		const interactive = !!newest && (phase === 'full' || reopening || replyOpen);
		void window.electronAPI.notchSetInteractive(interactive);
	}, [newest?.id, phase, reopening, replyOpen]);

	// Hide the notch window once the buffer has been empty briefly.
	// NOTE: This is intentionally NOT gated on `!hovering`. On Windows the renderer
	// may never receive a `mouseleave` after `setIgnoreMouseEvents(true, { forward: true })`,
	// which would keep `hovering` stuck and prevent the notch from ever hiding.
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
		hovering,
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
	};
}
