import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';
import { Avatar } from './Avatar';
import { getCircleColor } from '../../shared/group-color';
import type { CircleState, GitHubLoginState, IdentityState, UpdateState } from '../../shared/types';

export default function MenuWindow() {
	const {
		state,
		joinCircle,
		leaveCircle,
		sendChat,
		updateProfile,
		startGitHubLogin,
		cancelGitHubLogin,
		githubLogout,
		checkForUpdates,
		installUpdate,
	} = useAppStore();

	const [joinCode, setJoinCode] = useState('');
	const [joinRelay, setJoinRelay] = useState('');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [confirmingLeave, setConfirmingLeave] = useState<string | null>(null);
	const [displayName, setDisplayName] = useState(state.identity?.displayName ?? '');
	const [messages, setMessages] = useState<Record<string, string>>({});
	const [recipients, setRecipients] = useState<Record<string, string>>({});
	const [sendErrors, setSendErrors] = useState<Record<string, string>>({});

	useEffect(() => {
		if (state.identity) {
			setDisplayName(state.identity.displayName);
		}
	}, [state.identity?.displayName]);

	useEffect(() => {
		if (confirmingLeave && !state.circles.some((c) => c.code === confirmingLeave)) {
			setConfirmingLeave(null);
		}
	}, [state.circles, confirmingLeave]);

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
		const result = await sendChat(code, text, to);
		if (result.ok) {
			setMessages((prev) => ({ ...prev, [code]: '' }));
			setSendErrors((prev) => ({ ...prev, [code]: '' }));
		} else {
			setSendErrors((prev) => ({
				...prev,
				[code]: result.error ?? 'Circle offline — message not sent.',
			}));
		}
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
							<button onClick={() => window.electronAPI.showPalette()}>Quick send…</button>
							<div className="popover-divider" />
							<button onClick={() => void checkForUpdates()}>Check for Updates…</button>
							<div className="popover-divider" />
							<button onClick={() => window.electronAPI.quitApp()}>Quit</button>
						</div>
					)}
				</div>
			</div>

			<UpdateStatus state={state.updateState} onCheck={() => void checkForUpdates()} onInstall={() => void installUpdate()} />

			{state.circles.length === 0 && (
				<p className="hint">No circles yet. Create one or join with a code.</p>
			)}

			<div className="circle-list">
				{state.circles.map((circle, i) => (
					<CircleSection
						key={circle.code}
						circle={circle}
						colorIndex={i}
						message={messages[circle.code] ?? ''}
						recipient={recipients[circle.code] ?? ''}
						sendError={sendErrors[circle.code] ?? ''}
						onMessageChange={(text) => {
							setMessages((prev) => ({ ...prev, [circle.code]: text }))
							if (sendErrors[circle.code]) {
								setSendErrors((prev) => ({ ...prev, [circle.code]: '' }))
							}
						}}
						onRecipientChange={(to) =>
							setRecipients((prev) => ({ ...prev, [circle.code]: to }))
						}
						onSend={() => handleSend(circle.code)}
						onLeave={() => setConfirmingLeave(circle.code)}
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

			<div className="github-column">
				<GitHubSection
					identity={state.identity}
					loginState={state.githubLoginState}
					onStart={() => void startGitHubLogin()}
					onCancel={() => void cancelGitHubLogin()}
					onLogout={() => void githubLogout()}
				/>
			</div>

			{confirmingLeave && (
				<LeaveConfirmationDialog
					code={confirmingLeave}
					onConfirm={() => {
						void handleLeave(confirmingLeave);
						setConfirmingLeave(null);
					}}
					onCancel={() => setConfirmingLeave(null)}
				/>
			)}
		</div>
	);
}

function UpdateStatus({ state, onCheck, onInstall }: { state: UpdateState; onCheck: () => void; onInstall: () => void }) {
	if (state.phase === 'idle') return null;

	const labels: Record<Exclude<UpdateState['phase'], 'idle'>, string> = {
		checking: 'Checking for updates…',
		available: `Update available${state.version ? ` (v${state.version})` : ''}`,
		downloading: state.progress ? `Downloading update… ${Math.round(state.progress)}%` : 'Downloading update…',
		downloaded: `Update ready${state.version ? ` (v${state.version})` : ''}`,
		error: state.error ?? 'Update error',
	};

	const isError = state.phase === 'error';
	const isDownloaded = state.phase === 'downloaded';

	return (
		<div className={isError ? 'update-status update-error' : 'update-status'}>
			<span className="update-status-text">{labels[state.phase]}</span>
			{isError && (
				<button className="button-small" onClick={onCheck}>
					Retry
				</button>
			)}
			{isDownloaded && (
				<button className="button-small" onClick={onInstall}>
					Install
				</button>
			)}
		</div>
	);
}

interface GitHubSectionProps {
	identity: IdentityState | null;
	loginState: GitHubLoginState;
	onStart: () => void;
	onCancel: () => void;
	onLogout: () => void;
}

function GitHubSection({
	identity,
	loginState,
	onStart,
	onCancel,
	onLogout,
}: GitHubSectionProps) {
	const githubLogin = identity?.githubLogin;
	const displayName = identity?.displayName?.trim() || githubLogin || 'GitHub';

	if (loginState.phase === 'requesting') {
		return (
			<div className="github-row">
				<span className="spinner" />
				<div className="github-copy">
					<strong>Requesting GitHub code…</strong>
				</div>
			</div>
		);
	}

	if (loginState.phase === 'awaiting') {
		return (
			<div className="github-panel">
				<div className="github-row">
					<div className="github-copy">
						<strong>Finish sign-in on GitHub</strong>
						<span className="caption">Browser opened. The code is in your clipboard.</span>
					</div>
				</div>
				<div className="code-row">
					<span className="user-code">{loginState.userCode}</span>
					<button className="button-small" onClick={onCancel}>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	if (loginState.phase === 'fetching') {
		return (
			<div className="github-row">
				<span className="spinner" />
				<div className="github-copy">
					<strong>Fetching profile…</strong>
				</div>
			</div>
		);
	}

	if (loginState.phase === 'failed') {
		return (
			<div className="github-panel">
				<div className="github-copy">
					<strong>GitHub sign-in failed</strong>
					<span className="caption">{loginState.error}</span>
				</div>
				<div className="github-actions">
					<button className="button-small" onClick={onStart}>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (githubLogin) {
		return (
			<div className="github-row">
				<Avatar name={displayName} imageBase64={identity?.avatar} />
				<div className="github-copy">
					<strong>Signed in as {displayName}</strong>
					<span className="caption">@{githubLogin}</span>
				</div>
				<button className="button-small" onClick={onLogout}>
					Sign out
				</button>
			</div>
		);
	}

	return (
		<div className="github-row">
			<div className="github-copy">
				<strong>Sign in with GitHub</strong>
				<span className="caption">Import your public profile and avatar.</span>
			</div>
			<button className="button-small" onClick={onStart}>
				Sign in
			</button>
		</div>
	);
}

interface CircleSectionProps {
	circle: CircleState;
	colorIndex: number;
	message: string;
	recipient: string;
	sendError: string;
	onMessageChange: (text: string) => void;
	onRecipientChange: (to: string) => void;
	onSend: () => void;
	onLeave: () => void;
}

function CircleSection({
	circle,
	colorIndex,
	message,
	recipient,
	sendError,
	onMessageChange,
	onRecipientChange,
	onSend,
	onLeave,
}: CircleSectionProps) {
	const color = useMemo(() => getCircleColor(colorIndex), [colorIndex]);

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
				<button
					className="icon-button"
					title="Leave circle"
					data-testid="leave-circle-button"
					onClick={onLeave}
				>
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
					onFocus={() => void window.electronAPI.setMenuPickerOpen(true)}
					onBlur={() => void window.electronAPI.setMenuPickerOpen(false)}
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
			{sendError && <p className="compose-error">{sendError}</p>}
		</div>
	);
}

interface LeaveConfirmationDialogProps {
	code: string;
	onConfirm: () => void;
	onCancel: () => void;
}

function getDataTestId(target: unknown): string | undefined {
	if (!target || typeof target !== 'object') return undefined;
	const node = target as HTMLElement;
	if (node.dataset?.testid) return node.dataset.testid;
	const instance = target as { props?: { 'data-testid'?: string } };
	return instance.props?.['data-testid'];
}

function LeaveConfirmationDialog({ code, onConfirm, onCancel }: LeaveConfirmationDialogProps) {
	const cancelRef = useRef<HTMLButtonElement>(null);
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		cancelRef.current?.focus();
	}, []);

	const titleId = `leave-dialog-title-${code}`;

	function handleOverlayKeyDown(e: React.KeyboardEvent) {
		if (e.key === 'Escape') {
			onCancel();
			return;
		}

		if (e.key !== 'Tab') return;

		const targetTestId = getDataTestId(e.target);
		if (e.shiftKey && targetTestId === 'leave-dialog-cancel') {
			e.preventDefault();
			confirmRef.current?.focus();
		} else if (!e.shiftKey && targetTestId === 'leave-dialog-confirm') {
			e.preventDefault();
			cancelRef.current?.focus();
		}
	}

	return (
		<div
			className="leave-dialog-overlay"
			data-testid="leave-dialog-overlay"
			role="presentation"
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
			onKeyDown={handleOverlayKeyDown}
		>
			<div
				className="leave-dialog glass"
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				onClick={(e) => e.stopPropagation()}
			>
				<h3 id={titleId} className="leave-dialog-title" data-testid="leave-dialog-title">
					Leave circle &apos;{code}&apos;?
				</h3>
				<div className="leave-dialog-actions">
					<button
						ref={cancelRef}
						className="button-small"
						data-testid="leave-dialog-cancel"
						onClick={onCancel}
					>
						Cancel
					</button>
					<button
						ref={confirmRef}
						className="button-primary"
						data-testid="leave-dialog-confirm"
						onClick={onConfirm}
					>
						Leave
					</button>
				</div>
			</div>
		</div>
	);
}
