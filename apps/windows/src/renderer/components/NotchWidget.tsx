import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Avatar } from './Avatar';
import { useAppStore } from '../store/app-store';
import { resolveReplyRecipient } from '../lib/resolve-reply-recipient';
import { shouldOpenReplyOnMessageClick } from '../lib/should-open-reply-on-message-click';
import { useNotchLifecycle, type NotchHistoryEntry } from '../lib/useNotchLifecycle';

const RING_RADIUS = 8;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ringStyle = { '--ring-circumference': `${RING_CIRCUMFERENCE}` } as CSSProperties;

// Debounce ResizeObserver-driven `notch-resize` IPC calls. Windows display
// scaling (125 %/150 %) can round `setSize()` to a height that differs
// slightly from the renderer's `offsetHeight`, which can retrigger the
// observer and cause an IPC-spamming resize oscillation. 80ms matches the
// notch's other UI timing constants (see the reply-focus delay below).
const RESIZE_REPORT_DEBOUNCE_MS = 80;

export default function NotchWidget() {
	const { sendChat } = useAppStore();

	const [replyText, setReplyText] = useState('');
	const [replyPrivate, setReplyPrivate] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const replyInputRef = useRef<HTMLInputElement>(null);
	const widgetRef = useRef<HTMLDivElement>(null);

	// Report the widget's layout height to the main process so the notch
	// window shrinks/grows to its content instead of staying a fixed-size
	// box (WIN-NOTCH-004). offsetHeight is used because it ignores the
	// slide-up transforms of the peek/retracted states.
	useEffect(() => {
		const el = widgetRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;
		let debounceTimer: ReturnType<typeof setTimeout> | undefined;
		const report = () => void window.electronAPI.notchResize(el.offsetHeight);
		const debouncedReport = () => {
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(report, RESIZE_REPORT_DEBOUNCE_MS);
		};
		const observer = new ResizeObserver(debouncedReport);
		observer.observe(el);
		// Report the initial size immediately so the window is sized correctly
		// before the first observer callback would otherwise fire.
		report();
		return () => {
			observer.disconnect();
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	}, []);

	const handleNotchHide = useCallback(() => {
		setReplyText('');
		setError(null);
	}, []);
	const lifecycle = useNotchLifecycle({ onNotchHide: handleNotchHide });
	// Pointer-down position on the message body, so a click that was really a
	// drag-to-select gesture does not open the reply field (see openReply).
	const messagePointerDown = useRef<{ id: string; x: number; y: number } | null>(null);

	const {
		history,
		newest,
		phase,
		reopening,
		replyOpen,
		replyingTo,
		copiedId,
		openReply: openReplyLifecycle,
		closeReply,
		onNotchMessage,
		copyText,
		scheduleHoverLeave,
		cancelHoverLeave,
		reopenFromHoverTarget,
	} = lifecycle;

	const expanded = reopening || replyOpen;
	const widgetClass = newest
		? reopening
			? 'notch-reopened'
			: replyOpen || phase === 'full'
				? 'notch-full'
				: `notch-${phase}`
		: 'notch-retracted';

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
		const removeMessage = window.electronAPI.onNotchMessage((data) => {
			onNotchMessage(data);
			// A new message makes any in-flight reply text/context stale.
			setReplyText('');
			setError(null);
		});
		const removeUpdate = window.electronAPI.onNotchUpdate((data) => {
			setReplyPrivate(data.isDirect);
		});
		return () => {
			removeMessage();
			removeUpdate();
		};
	}, [onNotchMessage]);

	useEffect(() => {
		if (!newest) return;
		setReplyPrivate(newest.isDirect);
	}, [newest?.id]);

	useEffect(() => {
		if (!replyingTo) return;
		if (history.some((entry) => entry.id === replyingTo)) return;
		closeReply();
		setReplyText('');
		setError(null);
	}, [history, replyingTo, closeReply]);

	function openReply(entry: NotchHistoryEntry) {
		if (replyingTo !== entry.id) {
			setReplyText('');
			setError(null);
		}
		setReplyPrivate(entry.isDirect);
		openReplyLifecycle(entry);
	}

	function handleCopyText(entry: NotchHistoryEntry, e: React.MouseEvent) {
		e.stopPropagation();
		copyText(entry);
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
			closeReply();
		} finally {
			setSending(false);
		}
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
					<button className="icon-button copy-button" onClick={(e) => handleCopyText(entry, e)}>
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
									if (e.key === 'Escape') closeReply();
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
			ref={widgetRef}
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
