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

// Minimum spacing between hover-copy activity pings sent to the main process
// on mousemove. The main process disarms the "C" shortcut after ~15s without
// a ping (HOVER_COPY_IDLE_MS), so ~1s pings keep it alive during genuine
// pointer activity while staying cheap on the IPC channel. Pings are sent
// synchronously from the mousemove handler (no deferred timer), so nothing
// here can fire after a mouseleave — a "late ping" only exists as an IPC
// message already in flight, which the main process's post-disarm re-arm
// cooldown absorbs (see hover-copy-shortcut.ts).
const HOVER_COPY_PING_THROTTLE_MS = 1_000;

export default function NotchWidget() {
	const { sendChat } = useAppStore();

	const [replyText, setReplyText] = useState('');
	const [replyPrivate, setReplyPrivate] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const replyInputRef = useRef<HTMLInputElement>(null);
	const widgetRef = useRef<HTMLDivElement>(null);

	// Hover-"C" copy (Plan 12 P3.2). `notchHovered` tracks whether the pointer
	// is currently over the notch surface; `hoveredEntryId` tracks which
	// history row (if any) it's over, so the shortcut copies that row instead
	// of the newest message. Both are mirrored into refs (via effects — no
	// ref mutation during render) so the stable `onNotchCopyHovered` listener
	// below always reads the latest value without resubscribing.
	const [notchHovered, setNotchHovered] = useState(false);
	const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
	const notchHoveredRef = useRef(false);
	const hoveredEntryIdRef = useRef<string | null>(null);
	useEffect(() => {
		notchHoveredRef.current = notchHovered;
	}, [notchHovered]);
	useEffect(() => {
		hoveredEntryIdRef.current = hoveredEntryId;
	}, [hoveredEntryId]);
	// Feature-off latch: set once the main process reports that registering
	// the OS-level "C" shortcut failed (e.g. another app owns the key). All
	// further arm attempts and activity pings are skipped for this session
	// instead of silently pretending the shortcut is armed.
	const hoverCopyUnavailableRef = useRef(false);
	// Throttle for the mousemove activity pings that keep the main process's
	// idle-disarm timer alive (see hover-copy-shortcut.ts HOVER_COPY_IDLE_MS).
	const lastHoverCopyPingRef = useRef(0);

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
		// The window is hiding — no mouseleave will ever arrive for the
		// pointer that may have armed the hover-copy shortcut, so reset the
		// hover state here (the main process also disarms on its own 'hide'
		// event as the authoritative backstop).
		setNotchHovered(false);
		setHoveredEntryId(null);
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
		unread,
		openReply: openReplyLifecycle,
		closeReply,
		onNotchMessage,
		copyText,
		scheduleHoverLeave,
		cancelHoverLeave,
		reopenFromHoverTarget,
	} = lifecycle;

	const widgetClass = newest
		? reopening
			? 'notch-reopened'
			: replyOpen || phase === 'full'
				? 'notch-full'
				: `notch-${phase}`
		: 'notch-retracted';

	const replyOpenRef = useRef(false);
	useEffect(() => {
		replyOpenRef.current = replyOpen;
	}, [replyOpen]);
	// Latest history/newest for the stable copy listener below — avoids a
	// stale-closure window between unsubscribe/resubscribe cycles.
	const historyRef = useRef(history);
	useEffect(() => {
		historyRef.current = history;
	}, [history]);
	const newestRef = useRef(newest);
	useEffect(() => {
		newestRef.current = newest;
	}, [newest]);

	// Send an arm/disarm hint to the main process. The main process owns the
	// actual shortcut lifecycle (idle timeout + hide/crash/click-through
	// disarms); a resolved `false` on an arm attempt means OS registration
	// failed, which latches the feature off for this session.
	const sendHoverCopyHint = useCallback((active: boolean) => {
		if (hoverCopyUnavailableRef.current) return;
		void window.electronAPI.notchSetHoverCopyActive(active).then((ok) => {
			if (active && !ok) {
				hoverCopyUnavailableRef.current = true;
				console.warn('[notch] hover-"C" copy unavailable (OS shortcut registration failed) — disabled for this session');
			}
		});
	}, []);

	// Arm/disarm whenever hover or reply-open state changes. Active only
	// while the notch is hovered AND no reply field is open, matching
	// macOS's `hovering && !replying` gate in NotchPresenter.
	useEffect(() => {
		sendHoverCopyHint(notchHovered && !replyOpen);
	}, [notchHovered, replyOpen, sendHoverCopyHint]);

	// Always request disarm on unmount, independent of the effect above
	// (which only fires on hover/replyOpen changes, not on teardown). The
	// main process's renderer-gone/destroyed hooks are the backstop if this
	// IPC never arrives.
	useEffect(() => {
		return () => {
			if (hoverCopyUnavailableRef.current) return;
			void window.electronAPI.notchSetHoverCopyActive(false);
		};
	}, []);

	// While armed-eligible, mousemove over the notch sends throttled activity
	// pings that reset the main process's idle-disarm timer — so a pointer
	// merely *resting* on the notch stops capturing "C" system-wide after
	// ~15s, but genuine hovering keeps the shortcut alive (and re-arms it
	// after an idle disarm).
	const reportHoverCopyActivity = useCallback(() => {
		if (!notchHoveredRef.current || replyOpenRef.current) return;
		const now = Date.now();
		if (now - lastHoverCopyPingRef.current < HOVER_COPY_PING_THROTTLE_MS) return;
		lastHoverCopyPingRef.current = now;
		sendHoverCopyHint(true);
	}, [sendHoverCopyHint]);

	// Perform the actual copy when the main process reports the hover-"C"
	// shortcut fired. Subscribed once; all state is read through refs so the
	// handler can never act on a stale history snapshot. Re-checks
	// hover/reply state itself rather than trusting the main process's
	// gating alone — belt and suspenders, since the IPC arming call and a
	// fast mouseleave could theoretically race.
	useEffect(() => {
		return window.electronAPI.onNotchCopyHovered(() => {
			if (!notchHoveredRef.current || replyOpenRef.current) return;
			const hoveredId = hoveredEntryIdRef.current;
			const hovered = hoveredId ? historyRef.current.find((entry) => entry.id === hoveredId) : undefined;
			const target = hovered ?? newestRef.current;
			if (!target) return;
			copyText(target);
		});
	}, [copyText]);

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

	/**
	 * `pulse` is only ever passed `true` from the single/"full-view" render
	 * branch below (never from the reopened history-list branch), and only
	 * for the entry that is currently `newest`. Those two branches render
	 * structurally different JSX (a bare row vs. a `.notch-history-list`
	 * wrapper), so React unmounts/remounts this row's subtree — including
	 * `Avatar` — whenever the widget switches between them. Combined with
	 * `Avatar`'s own mount-only pulse capture (see `Avatar.tsx`), this means
	 * the ring plays exactly once: on the fresh mount that happens when a
	 * genuinely new message arrives (`phase` resets to `'full'`, which
	 * changes this row's `key` in the parent `newest.id` sense). Re-renders
	 * while `newest` stays visible (e.g. phase decaying to `'peek'` while a
	 * reply stays open) reuse the same mounted Avatar and do not re-pulse;
	 * reopening the notch via hover re-mounts the row in the *other* branch,
	 * which never passes `pulse`, so already-seen history rows never pulse.
	 */
	function renderMessageRow(entry: NotchHistoryEntry, options?: { pulse?: boolean }) {
		const hasImages = !!entry.images?.length;
		const replying = replyingTo === entry.id;

		return (
			<div
				key={entry.id}
				className="history-entry"
				data-testid={`history-entry-${entry.id}`}
				onMouseEnter={() => setHoveredEntryId(entry.id)}
				onMouseLeave={() => setHoveredEntryId((current) => (current === entry.id ? null : current))}
			>
				<div className="message-row">
					<Avatar name={entry.sender} size={40} pulse={options?.pulse ?? false} />
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
			data-testid="notch-widget"
			onMouseEnter={() => {
				cancelHoverLeave();
				setNotchHovered(true);
			}}
			onMouseMove={reportHoverCopyActivity}
			onMouseLeave={() => {
				scheduleHoverLeave();
				setNotchHovered(false);
				setHoveredEntryId(null);
			}}
		>
			{history.length > 0 && <div className="notch-hover-target" onMouseEnter={reopenFromHoverTarget} />}
			<div className="notch-sliver" aria-hidden="true">
				{phase === 'peek' && !(reopening || replyOpen) && (
					<svg className="notch-ring" width="20" height="20" viewBox="0 0 20 20" style={ringStyle}>
						<circle className="track" cx="10" cy="10" r={RING_RADIUS} />
						<circle className="progress" cx="10" cy="10" r={RING_RADIUS} />
					</svg>
				)}
				<div className="notch-grabber" />
				{unread && <span className="notch-unread-dot" data-testid="notch-unread-dot" />}
			</div>

			{reopening && history.length > 0 ? (
				<div className="notch-content">
					<div className="notch-history-list">{history.map((entry) => renderMessageRow(entry))}</div>
				</div>
			) : newest && (phase === 'full' || replyingTo === newest.id) ? (
				<div className="notch-content">{renderMessageRow(newest, { pulse: true })}</div>
			) : null}
		</div>
	);
}
