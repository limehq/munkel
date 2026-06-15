import { useEffect, useMemo, useState } from 'react';
import { useIpc } from '../hooks/useIpc';
import { useAppStore } from '../store/app-store';
import { Avatar } from './Avatar';
import { getCircleColor } from '../../shared/group-color';
import type { CircleState } from '../../shared/types';

export default function MenuWindow() {
	const ipc = useIpc();
	const { state, joinCircle, leaveCircle, sendChat, updateProfile } = useAppStore();

	const [joinCode, setJoinCode] = useState('');
	const [joinRelay, setJoinRelay] = useState('');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [displayName, setDisplayName] = useState(state.identity?.displayName ?? '');
	const [messages, setMessages] = useState<Record<string, string>>({});
	const [recipients, setRecipients] = useState<Record<string, string>>({});

	useEffect(() => {
		if (state.identity) {
			setDisplayName(state.identity.displayName);
		}
	}, [state.identity?.displayName]);

	function rollCode() {
		const parts = Array.from({ length: 2 }, () =>
			Math.random().toString(36).slice(2, 6).toLowerCase(),
		);
		setJoinCode(parts.join('-'));
	}

	async function handleJoin(e?: React.FormEvent) {
		e?.preventDefault();
		const code = joinCode.trim();
		if (!code) return;
		await joinCircle(code, joinRelay.trim() || undefined);
		setJoinCode('');
		setJoinRelay('');
	}

	async function handleLeave(code: string) {
		await leaveCircle(code);
	}

	async function handleSend(code: string) {
		const text = messages[code]?.trim();
		if (!text) return;
		const to = recipients[code] || undefined;
		await sendChat(code, text, to);
		setMessages((prev) => ({ ...prev, [code]: '' }));
	}

	function updateName() {
		const name = displayName.trim();
		if (!name) return;
		void updateProfile(name);
	}

	return (
		<div
			className="menu-window glass"
			onClick={() => setSettingsOpen(false)}
			onKeyDown={(e) => {
				if (e.key === 'Escape') setSettingsOpen(false);
			}}
		>
			<div className="menu-header">
				<div className="menu-title">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
						<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" opacity="0.5" />
						<path d="M6 5h14c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2h-2l-4 3v-3H6c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2z" />
					</svg>
					Munkel
				</div>
				<div className="settings-wrapper">
					<button
						className="icon-button"
						onClick={(e) => {
							e.stopPropagation();
							setSettingsOpen((s) => !s);
						}}
						title="Settings"
					>
						⚙
					</button>
					{settingsOpen && (
						<div className="settings-popover glass" onClick={(e) => e.stopPropagation()}>
							<label className="caption" style={{ display: 'block', marginBottom: 4 }}>
								Display name
							</label>
							<input
								className="frosted-field"
								value={displayName}
								onChange={(e) => setDisplayName(e.target.value)}
								onBlur={updateName}
								onKeyDown={(e) => {
									if (e.key === 'Enter') updateName();
								}}
								placeholder="Your name"
							/>
							<div className="popover-divider" />
							<button onClick={() => ipc.showPalette()}>Quick send…</button>
							<div className="popover-divider" />
							<button onClick={() => ipc.quitApp()}>Quit</button>
						</div>
					)}
				</div>
			</div>

			{state.circles.length === 0 && (
				<p className="hint">No circles yet. Create one or join with a code.</p>
			)}

			<div className="circle-list">
				{state.circles.map((circle) => (
					<CircleSection
						key={circle.code}
						circle={circle}
						message={messages[circle.code] ?? ''}
						recipient={recipients[circle.code] ?? ''}
						onMessageChange={(text) =>
							setMessages((prev) => ({ ...prev, [circle.code]: text }))
						}
						onRecipientChange={(to) =>
							setRecipients((prev) => ({ ...prev, [circle.code]: to }))
						}
						onSend={() => handleSend(circle.code)}
						onLeave={() => handleLeave(circle.code)}
					/>
				))}
			</div>

			<div className="divider" />

			<form className="join-area" onSubmit={handleJoin}>
				<div className="join-row">
					<input
						className="frosted-field"
						placeholder="Your circle"
						value={joinCode}
						onChange={(e) => setJoinCode(e.target.value)}
					/>
					<button
						type="button"
						className="icon-button"
						title="Roll a random code"
						onClick={rollCode}
					>
						🎲
					</button>
					<button type="submit" className="button-primary" disabled={!joinCode.trim()}>
						Join
					</button>
				</div>
				<input
					className="frosted-field"
					style={{ marginTop: 8, width: '100%' }}
					placeholder="Relay URL (optional, defaults to dev relay)"
					value={joinRelay}
					onChange={(e) => setJoinRelay(e.target.value)}
				/>
				<p className="caption">If the circle doesn&apos;t exist yet, it&apos;s created.</p>
			</form>

			<div className="divider" />

			<div className="hotkey-row">
				<span className="hotkey-icon">➤</span>
				<span>Quick send</span>
				<span className="hotkey">Ctrl + Shift + M</span>
			</div>

			<div className="divider" />

			<div className="github-row">
				<button className="button-small" onClick={() => ipc.testNotch()}>
					Test notch
				</button>
			</div>
		</div>
	);
}

interface CircleSectionProps {
	circle: CircleState;
	message: string;
	recipient: string;
	onMessageChange: (text: string) => void;
	onRecipientChange: (to: string) => void;
	onSend: () => void;
	onLeave: () => void;
}

function CircleSection({
	circle,
	message,
	recipient,
	onMessageChange,
	onRecipientChange,
	onSend,
	onLeave,
}: CircleSectionProps) {
	const color = useMemo(() => getCircleColor(circle.code), [circle.code]);

	return (
		<div className="circle-section">
			<div className="circle-header">
				<span className="status-dot" style={{ background: circle.isConnected ? '#34c759' : '#ff9f0a' }} />
				<span className="circle-code">{circle.code}</span>
				<span
					className="circle-dot"
					style={{ background: color, width: 8, height: 8, borderRadius: '50%', marginLeft: 4 }}
				/>
				<div style={{ flex: 1 }} />
				<button className="icon-button" title="Leave circle" onClick={onLeave}>
					➡️
				</button>
			</div>

			{circle.members.length === 0 ? (
				<p className="caption">No one else online</p>
			) : (
				<div className="member-row">
					<div className="avatar-stack">
						{circle.members.slice(0, 8).map((m) => (
							<Avatar
								key={m.memberId}
								name={m.displayName ?? m.memberId.slice(0, 8)}
								size={16}
							/>
						))}
					</div>
					<span className="member-names">
						{circle.members.map((m) => m.displayName ?? m.memberId.slice(0, 8)).join(', ')}
					</span>
				</div>
			)}

			<div className="send-row">
				<select
					className="frosted-field recipient-select"
					value={recipient}
					onChange={(e) => onRecipientChange(e.target.value)}
				>
					<option value="">All</option>
					{circle.members.map((m) => (
						<option key={m.memberId} value={m.memberId}>
							{m.displayName ?? m.memberId.slice(0, 8)}
						</option>
					))}
				</select>
				<input
					className="frosted-field"
					placeholder="Message…"
					value={message}
					onChange={(e) => onMessageChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') onSend();
					}}
				/>
				<button className="icon-button" onClick={onSend} disabled={!message.trim()}>
					➤
				</button>
			</div>
		</div>
	);
}
