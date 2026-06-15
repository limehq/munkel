import { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { sampleMessage } from '../mock-data';
import type { NotchMessage } from '../../shared/types';

export default function NotchWidget() {
	const [visible, setVisible] = useState(false);
	const [message, setMessage] = useState<NotchMessage>(sampleMessage);
	const [replying, setReplying] = useState(false);
	const [replyText, setReplyText] = useState('');
	const [copied, setCopied] = useState(false);
	const [replyPrivate, setReplyPrivate] = useState(sampleMessage.isDirect);

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
		navigator.clipboard.writeText(message.text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	function sendReply() {
		if (!replyText.trim()) return;
		setReplying(false);
		setReplyText('');
	}

	return (
		<div className={`notch-widget ${visible ? 'notch-visible' : ''}`}>
			<div className="notch-content">
				<div className="message-row" onClick={() => setReplying(true)}>
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
					</div>
					<button className="icon-button copy-button" onClick={copyText}>
						{copied ? '✓' : '📋'}
					</button>
				</div>

				{replying && (
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
							onChange={(e) => setReplyText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') sendReply();
								if (e.key === 'Escape') setReplying(false);
							}}
							autoFocus
						/>
					</div>
				)}
			</div>
		</div>
	);
}
