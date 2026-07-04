import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Avatar } from './Avatar';
import { useAppStore } from '../store/app-store';
import { NOTCH_FULL_MS, NOTCH_HISTORY_MS, NOTCH_RETRACT_AT_MS, type NotchPhase } from '../lib/notch-phase';
import { pruneNotchHistory } from '../lib/prune-notch-history';
import { resolveReplyRecipient } from '../lib/resolve-reply-recipient';
import { shouldOpenReplyOnMessageClick } from '../lib/should-open-reply-on-message-click';
import type { NotchMessage } from '../../shared/types';

interface NotchHistoryEntry extends NotchMessage {
	id: string;
}

const HOVER_LEAVE_DELAY_MS = 150;
const EMPTY_HIDE_DELAY_MS = 350;
const COPY_FEEDBACK_MS = 1_500;
const PRUNE_INTERVAL_MS = 1_000;
const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ringStyle = { '--ring-circumference': `${RING_CIRCUMFERENCE}` } as CSSProperties;

let notchIdCounter = 0;

function nextNotchId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${notchIdCounter++}`;
}

export default function NotchWidget() {
	const { sendChat } = useAppStore();
	const [history, setHistory] = useState<NotchHistoryEntry[]>([]);
	const [phase, setPhase] = useState<NotchPhase>('retracted');
	const [hovering, setHovering] = useState(false);
	const [replyingTo, setReplyingTo] = useState<string | null>(null);
	const [replyText, setReplyText] = useState('');
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [replyPrivate, setReplyPrivate] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const replyInputRef = useRef<HTMLInputElement>(null);
	const historyLenRef = useRef(0);
	const phaseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
	const leaveHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Pointer-down position on the message body, so a click that was really a
	// drag-to-select gesture does not open the reply field (see openReply).
	const messagePointerDown = useRef<{ id: string; x: number; y: number } | null>(null);

	const newest = history[0] ?? null;
	const reopening = hovering;
	const replyOpen = replyingTo !== null;
	const expanded = reopening || replyOpen;
	const widgetClass = newest
		? reopening
			? 'notch-reopened'
			: replyOpen || phase === 'full'
				? 'notch-full'
				: `notch-${phase}`
		: 'notch-retracted';
	historyLenRef.current = history.length;

	useEffect(() => {
		if (!replyingTo) return;
		let cancelled = false;
		let focusTimer: ReturnType<typeof setTimeout> | undefined;
		void (async () => {
			await window.electronAPI.beginNotchReply();
			if (cancelled) return;
			// Wait ~80ms for the notch window to gain OS-level focus before
			// focusing the input (macOS parity). A single rAF races the window
			// focus and can silently drop the input focus — most visible under
			// React StrictMode's double-invoke in dev.
			focusTimer = setTimeout(() => replyInputRef.current?.focus(), 80);
		})();
		return () => {
			cancelled = true;
			if (focusTimer) clearTimeout(focusTimer);
			void window.electronAPI.endNotchReply();
		};
	}, [replyingTo]);

	useEffect(() => {
		const removeShow = window.electronAPI.onNotchShow(() => {
			if (leaveHoverTimer.current) {
				clearTimeout(leaveHoverTimer.current);
				leaveHoverTimer.current = null;
			}
		});
		const removeHide = window.electronAPI.onNotchHide(() => {
			setHovering(false);
			setReplyingTo(null);
			setReplyText('');
			setError(null);
		});
		const removeUpdate = window.electronAPI.onNotchUpdate((data) => {
			setReplyPrivate(data.isDirect);
		});
		const removeMessage = window.electronAPI.onNotchMessage((data) => {
			const entry: NotchHistoryEntry = {
				...data,
				id: nextNotchId(),
				receivedAt: data.receivedAt ?? new Date().toISOString(),
			};
			setHistory((current) => pruneNotchHistory([entry, ...current], Date.now(), NOTCH_HISTORY_MS));
			setHovering(false);
			setReplyPrivate(data.isDirect);
			// Reset compose state: a new message means the prior reply
			// context (recipient, text) is stale.
			setReplyingTo(null);
			setReplyText('');
			setError(null);
		});
		const removeReopen = window.electronAPI.onNotchReopen(() => {
			if (historyLenRef.current > 0) {
				setHovering(true);
			}
		});
		return () => {
			removeShow();
			removeHide();
			removeUpdate();
			removeMessage();
			removeReopen();
		};
	}, []);

	useEffect(() => {
		if (!newest) {
			setPhase('retracted');
			phaseTimers.current = [];
			return;
		}
		setPhase('full');
		const fullTimer = setTimeout(() => setPhase('peek'), NOTCH_FULL_MS);
		const retractTimer = setTimeout(() => setPhase('retracted'), NOTCH_RETRACT_AT_MS);
		phaseTimers.current = [fullTimer, retractTimer];
		return () => {
			clearTimeout(fullTimer);
			clearTimeout(retractTimer);
			phaseTimers.current = [];
		};
	}, [newest?.id]);

	useEffect(() => {
		const pruneTimer = setInterval(() => {
			setHistory((current) => {
				const pruned = pruneNotchHistory(current, Date.now(), NOTCH_HISTORY_MS);
				return pruned.length === current.length ? current : pruned;
			});
		}, PRUNE_INTERVAL_MS);
		return () => clearInterval(pruneTimer);
	}, []);

	useEffect(() => {
		const interactive = !!newest && (phase === 'full' || reopening || replyOpen);
		void window.electronAPI.notchSetInteractive(interactive);
	}, [newest?.id, phase, reopening, replyOpen]);

	useEffect(() => {
		if (history.length > 0 || hovering) return;
		const emptyTimer = setTimeout(() => {
			void window.electronAPI.notchEmpty();
		}, EMPTY_HIDE_DELAY_MS);
		return () => clearTimeout(emptyTimer);
	}, [history.length, hovering]);

	useEffect(() => {
		if (!replyingTo) return;
		if (history.some((entry) => entry.id === replyingTo)) return;
		setReplyingTo(null);
		setReplyText('');
		setError(null);
	}, [history, replyingTo]);

	useEffect(() => {
		return () => {
			if (leaveHoverTimer.current) clearTimeout(leaveHoverTimer.current);
			if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
		};
	}, []);

	function openReply(entry: NotchHistoryEntry) {
		if (replyingTo !== entry.id) {
			setReplyText('');
			setError(null);
		}
		setReplyPrivate(entry.isDirect);
		setReplyingTo(entry.id);
	}

	function copyText(entry: NotchHistoryEntry, e: React.MouseEvent) {
		e.stopPropagation();
		void navigator.clipboard.writeText(entry.text);
		setCopiedId(entry.id);
		if (copyFeedbackTimer.current) {
			clearTimeout(copyFeedbackTimer.current);
		}
		copyFeedbackTimer.current = setTimeout(() => {
			setCopiedId(null);
			copyFeedbackTimer.current = null;
		}, COPY_FEEDBACK_MS);
	}

	/**
	 * Open the reply field when the message body itself is clicked — a second,
	 * equivalent path to the ↩ button. The Copy/↩ buttons are siblings of
	 * `.message-body`, so their clicks never reach here; image thumbnails are
	 * excluded via their own `stopPropagation` (they may gain a lightbox later).
	 */
	function openReplyFromMessage(entry: NotchHistoryEntry, e: React.MouseEvent<HTMLDivElement>) {
		const down = messagePointerDown.current;
		const pointerMovedPx =
			down && down.id === entry.id
				? Math.hypot(e.clientX - down.x, e.clientY - down.y)
				: 0;
		const selection = window.getSelection();
		const hasTextSelection =
			!!selection &&
			selection.toString().length > 0 &&
			// Scope the selection check to this message body only.
			e.currentTarget.contains(selection.anchorNode);
		if (
			!shouldOpenReplyOnMessageClick({
				replying: replyingTo === entry.id,
				hasTextSelection,
				pointerMovedPx,
			})
		) {
			return;
		}
		openReply(entry);
	}

	async function sendReply(entry: NotchHistoryEntry) {
		const text = replyText.trim();
		if (!text || sending) return;
		setSending(true);
		setError(null);
		try {
			const recipient = resolveReplyRecipient(entry, replyPrivate);
			if (!recipient.ok) {
				setError(recipient.error);
				return;
			}
			const result = await sendChat(entry.group, text, recipient.to);
			if (!result.ok) {
				setError(result.error ?? 'Circle offline — reply not sent.');
				return; // keep text, leave field open
			}
			setReplyText('');
			setReplyingTo(null);
		} finally {
			setSending(false);
		}
	}

	function reopenFromHoverTarget() {
		if (history.length === 0) return;
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
			leaveHoverTimer.current = null;
		}
		setHovering(true);
	}

	function cancelHoverLeave() {
		if (leaveHoverTimer.current) {
			clearTimeout(leaveHoverTimer.current);
			leaveHoverTimer.current = null;
		}
	}

	function scheduleHoverLeave() {
		if (replyingTo) return;
		cancelHoverLeave();
		leaveHoverTimer.current = setTimeout(() => {
			setHovering(false);
			leaveHoverTimer.current = null;
		}, HOVER_LEAVE_DELAY_MS);
	}

	function renderMessageRow(entry: NotchHistoryEntry) {
		const hasImages = !!entry.images?.length;
		const replying = replyingTo === entry.id;

		return (
			<div key={entry.id} className="history-entry">
				<div className="message-row">
					<Avatar name={entry.sender} size={40} />
					<div
						className="message-body"
						onPointerDown={(e) => {
							messagePointerDown.current = { id: entry.id, x: e.clientX, y: e.clientY };
						}}
						onClick={(e) => openReplyFromMessage(entry, e)}
					>
						<div className="message-meta">
							<span className="sender">{entry.sender}</span>
							<span>{entry.isDirect ? '🔒' : '🌐'}</span>
							<span>·</span>
							<span className="circle-dot" style={{ background: entry.groupColor }} />
							<span className="circle-name">{entry.group}</span>
						</div>
						<p className="message-text">{entry.text}</p>
						{hasImages && (
							<div className="image-preview-row" onClick={(e) => e.stopPropagation()}>
								{entry.images!.map((img) => (
									<img
										key={img.id}
										className="image-preview-thumb"
										src={`data:image/avif;base64,${img.thumb}`}
										alt={`${img.width}×${img.height}`}
										title={`${img.width}×${img.height}`}
									/>
								))}
							</div>
						)}
					</div>
					<button className="icon-button copy-button" onClick={(e) => copyText(entry, e)}>
						{copiedId === entry.id ? '✓' : '📋'}
					</button>
					<button
						className="icon-button reply-button"
						onClick={(e) => {
							e.stopPropagation();
							openReply(entry);
						}}
						aria-label="Reply"
						title="Reply"
					>
						↩
					</button>
				</div>

				{replying && (
					<>
						<div className="reply-field">
							<button
								className="channel-toggle"
								onClick={() => setReplyPrivate(!replyPrivate)}
								title={replyPrivate ? 'Private reply' : 'Reply to all'}
							>
								{replyPrivate ? '🔒' : '🌐'}
							</button>
							<input
								ref={replyInputRef}
								className="frosted-field"
								placeholder={replyPrivate ? `Private to ${entry.sender}…` : 'Reply to all…'}
								value={replyText}
								onChange={(e) => {
									setReplyText(e.target.value);
									if (error) setError(null);
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter') void sendReply(entry);
									if (e.key === 'Escape') setReplyingTo(null);
								}}
							/>
							<button
								className="icon-button"
								disabled={!replyText.trim() || sending}
								onClick={() => void sendReply(entry)}
								title="Send"
							>
								➤
							</button>
						</div>
						{error && <p className="reply-error">{error}</p>}
					</>
				)}
			</div>
		);
	}

	return (
		<div
			className={`notch-widget ${widgetClass}`}
			onMouseEnter={cancelHoverLeave}
			onMouseLeave={scheduleHoverLeave}
		>
			{history.length > 0 && <div className="notch-hover-target" onMouseEnter={reopenFromHoverTarget} />}
			<div className="notch-sliver" aria-hidden="true">
				{phase === 'peek' && !expanded && (
					<svg className="notch-ring" width="20" height="20" viewBox="0 0 20 20" style={ringStyle}>
						<circle className="track" cx="10" cy="10" r={RING_RADIUS} />
						<circle className="progress" cx="10" cy="10" r={RING_RADIUS} />
					</svg>
				)}
				<div className="notch-grabber" />
			</div>

			{reopening && history.length > 0 ? (
				<div className="notch-content">
					<div className="notch-history-list">{history.map((entry) => renderMessageRow(entry))}</div>
				</div>
			) : newest && (phase === 'full' || replyingTo === newest.id) ? (
				<div className="notch-content">{renderMessageRow(newest)}</div>
			) : null}
		</div>
	);
}
