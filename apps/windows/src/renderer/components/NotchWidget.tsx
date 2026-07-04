import { useEffect, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { useAppStore } from '../store/app-store';
import { resolveReplyRecipient } from '../lib/resolve-reply-recipient';
import { shouldOpenReplyOnMessageClick } from '../lib/should-open-reply-on-message-click';
import type { NotchMessage } from '../../shared/types';

export default function NotchWidget() {
	const { sendChat } = useAppStore();
	const [visible, setVisible] = useState(false);
	const [message, setMessage] = useState<NotchMessage | null>(null);
	const [replying, setReplying] = useState(false);
	const [replyText, setReplyText] = useState('');
	const [copied, setCopied] = useState(false);
	const [replyPrivate, setReplyPrivate] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const replyInputRef = useRef<HTMLInputElement>(null);
	// Pointer-down position on the message body, so a click that was really a
	// drag-to-select gesture does not open the reply field (see openReply).
	const messagePointerDown = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		if (!replying) return;
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
	}, [replying]);

	useEffect(() => {
		const removeShow = window.electronAPI.onNotchShow(() => setVisible(true));
		const removeHide = window.electronAPI.onNotchHide(() => setVisible(false));
		const removeUpdate = window.electronAPI.onNotchUpdate((data) => {
			setMessage(data);
			setReplyPrivate(data.isDirect);
		});
		const removeMessage = window.electronAPI.onNotchMessage((data) => {
			setMessage(data);
			setReplyPrivate(data.isDirect);
			setVisible(true);
			// Reset compose state: a new message means the prior reply
			// context (recipient, text) is stale.
			setReplying(false);
			setReplyText('');
			setError(null);
		});
		return () => {
			removeShow();
			removeHide();
			removeUpdate();
			removeMessage();
		};
	}, []);

	function copyText(e: React.MouseEvent) {
		e.stopPropagation();
		if (!message) return;
		navigator.clipboard.writeText(message.text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	/**
	 * Open the reply field when the message body itself is clicked — a second,
	 * equivalent path to the ↩ button (both just call `setReplying(true)`, so the
	 * focus `useEffect` behaves identically). The Copy/↩ buttons are siblings of
	 * `.message-body`, so their clicks never reach here; image thumbnails are
	 * excluded via their own `stopPropagation` (they may gain a lightbox later).
	 */
	function openReplyFromMessage(e: React.MouseEvent) {
		const down = messagePointerDown.current;
		const pointerMovedPx = down
			? Math.hypot(e.clientX - down.x, e.clientY - down.y)
			: 0;
		const selection = window.getSelection();
		const hasTextSelection =
			!!selection &&
			selection.toString().length > 0 &&
			// Scope the selection check to this message body only.
			e.currentTarget.contains(selection.anchorNode);
		if (!shouldOpenReplyOnMessageClick({ replying, hasTextSelection, pointerMovedPx })) {
			return;
		}
		setReplying(true);
	}

	async function sendReply() {
		if (!message) return;
		const text = replyText.trim();
		if (!text || sending) return;
		setSending(true);
		setError(null);
		try {
			const recipient = resolveReplyRecipient(message, replyPrivate);
			if (!recipient.ok) {
				setError(recipient.error);
				return;
			}
			const result = await sendChat(message.group, text, recipient.to);
			if (!result.ok) {
				setError(result.error ?? 'Circle offline — reply not sent.');
				return; // keep text, leave field open
			}
			setReplyText('');
			setReplying(false);
		} finally {
			setSending(false);
		}
	}

	const hasImages = message && message.images && message.images.length > 0;

	return (
		<div className={`notch-widget ${visible && message ? 'notch-visible' : ''}`}>
			{message && (
				<div className="notch-content">
					<div className="message-row">
						<Avatar name={message.sender} size={40} />
						<div
							className="message-body"
							onPointerDown={(e) => {
								messagePointerDown.current = { x: e.clientX, y: e.clientY };
							}}
							onClick={openReplyFromMessage}
						>
							<div className="message-meta">
								<span className="sender">{message.sender}</span>
								<span>{message.isDirect ? '🔒' : '🌐'}</span>
								<span>·</span>
								<span className="circle-dot" style={{ background: message.groupColor }} />
								<span className="circle-name">{message.group}</span>
							</div>
							<p className="message-text">{message.text}</p>
							{hasImages && (
								<div
										className="image-preview-row"
										onClick={(e) => e.stopPropagation()}
									>
									{message.images!.map((img) => (
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
						<button className="icon-button copy-button" onClick={copyText}>
							{copied ? '✓' : '📋'}
						</button>
						<button
							className="icon-button reply-button"
							onClick={(e) => {
								e.stopPropagation();
								setReplying(true);
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
									placeholder={
										replyPrivate ? `Private to ${message.sender}…` : 'Reply to all…'
									}
									value={replyText}
									onChange={(e) => {
										setReplyText(e.target.value);
										if (error) setError(null);
									}}
									onKeyDown={(e) => {
										if (e.key === 'Enter') void sendReply();
										if (e.key === 'Escape') setReplying(false);
									}}
								/>
								<button
									className="icon-button"
									disabled={!replyText.trim() || sending}
									onClick={() => void sendReply()}
									title="Send"
								>
									➤
								</button>
							</div>
							{error && <p className="reply-error">{error}</p>}
						</>
					)}
				</div>
			)}
		</div>
	);
}
