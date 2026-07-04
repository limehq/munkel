import { useEffect, useRef, useState } from 'react';
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
	setHovering: (value: boolean) => void;
	setReopening: (value: boolean) => void;
	setReplyOpen: (value: boolean) => void;
	openReply: (entry: NotchHistoryEntry) => void;
	closeReply: () => void;
	onNotchMessage: (message: NotchMessage) => void;
	copyText: (text: string) => void;
	scheduleHoverLeave: () => void;
	cancelHoverLeave: () => void;
	reopenFromHoverTarget: () => void;
}

export function useNotchLifecycle(): UseNotchLifecycleReturn {
	const [history, setHistory] = useState<NotchHistoryEntry[]>([]);
	const [phase, setPhase] = useState<NotchPhase>('retracted');
	const [hovering, setHovering] = useState(false);
	const [replyingTo, setReplyingTo] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const leaveHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const newest = history[0] ?? null;
	const reopening = hovering;
	const replyOpen = replyingTo !== null;

	const setReopening = (value: boolean) => setHovering(value);

	const cancelHoverLeave = () => {
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
			leaveHoverTimer.current = null;
		}
	};

	const scheduleHoverLeave = () => {
		if (replyOpen) return;
		cancelHoverLeave();
		leaveHoverTimer.current = setTimeout(() => {
			setHovering(false);
			leaveHoverTimer.current = null;
		}, HOVER_LEAVE_DELAY_MS);
	};

	const reopenFromHoverTarget = () => {
		if (history.length === 0) return;
		cancelHoverLeave();
		setHovering(true);
	};

	const setReplyOpen = (value: boolean) => {
		if (!value) {
			setReplyingTo(null);
		}
	};

	const openReply = (entry: NotchHistoryEntry) => {
		setReplyingTo(entry.id);
	};

	const closeReply = () => {
		setReplyingTo(null);
	};

	const copyText = (text: string) => {
		void navigator.clipboard.writeText(text);
	};

	const onNotchMessage = (message: NotchMessage) => {
		const entry: NotchHistoryEntry = {
			...message,
			id: nextNotchId(),
			receivedAt: message.receivedAt ?? new Date().toISOString(),
		};
		setHistory((current) => pruneNotchHistory([entry, ...current], Date.now(), NOTCH_HISTORY_MS));
		setHovering(false);
		cancelHoverLeave();
		closeReply();
	};

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

	// Copy feedback timer cleanup.
	useEffect(() => {
		return () => {
			if (copyFeedbackTimer.current) {
				clearTimeout(copyFeedbackTimer.current);
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

	// Internal copyText sets copiedId so the hook can drive the UI feedback.
	const copyTextWithFeedback = (text: string) => {
		// Identify the newest entry with matching text as the copied one.
		// This matches the previous per-entry behavior: only one item can show
		// feedback at a time.
		const entry = history.find((item) => item.text === text);
		copyText(text);
		if (entry) {
			setCopiedId(entry.id);
		}
	};

	return {
		history,
		newest,
		phase,
		hovering,
		reopening,
		replyOpen,
		replyingTo,
		copiedId,
		setHovering,
		setReopening,
		setReplyOpen,
		openReply,
		closeReply,
		onNotchMessage,
		copyText: copyTextWithFeedback,
		scheduleHoverLeave,
		cancelHoverLeave,
		reopenFromHoverTarget,
	};
}
