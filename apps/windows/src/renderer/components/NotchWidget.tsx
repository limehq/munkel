import { useCallback, useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { useAppStore } from '../store/app-store';
import type { NotchMessage } from '../../shared/types';

export default function NotchWidget() {
	const { state, sendChat } = useAppStore();
	const [visible, setVisible] = useState(false);
	const [message, setMessage] = useState<NotchMessage | null>(null);
	const [replying, setReplying] = useState(false);
	const [replyText, setReplyText] = useState('');
	const [copied, setCopied] = useState(false);
	const [replyPrivate, setReplyPrivate] = useState(false);
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	const lookupMemberId = useCallback(
		(group: string, sender: string): string | undefined => {
			const circle = state.circles.find((c) => c.code === group);
			if (!circle) return undefined;
			const member = circle.members.find(
				(m) => (m.displayName ?? m.memberId.slice(0, 8)) === sender
			);
			return member?.memberId;
		},
		[state.circles]
	);

	function copyText(e: React.MouseEvent) {
		e.stopPropagation();
		if (!message) return;
		navigator.clipboard.writeText(message.text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	async function sendReply() {
		if (!message) return;
		const text = replyText.trim();
		if (!text || sending) return;
		setSending(true);
		setError(null);
		try {
			const to = replyPrivate
				? lookupMemberId(message.group, message.sender) ?? message.sender
				: undefined;
			const result = await sendChat(message.group, text, to);
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
						<div className="message-body">
							<div className="message-meta">
								<span className="sender">{message.sender}</span>
								<span>{message.isDirect ? '🔒' : '🌐'}</span>
								<span>·</span>
								<span className="circle-dot" style={{ background: message.groupColor }} />
								<span className="circle-name">{message.group}</span>
							</div>
							<p className="message-text">{message.text}</p>
							{hasImages && (
								<div className="image-preview-row">
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
									autoFocus
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
