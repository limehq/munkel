import { useState } from 'react';
import { useIpc } from '../hooks/useIpc';
import { circles } from '../mock-data';
import { Avatar } from './Avatar';

type GitHubState =
	| { kind: 'idle' }
	| { kind: 'requesting' }
	| { kind: 'awaiting'; userCode: string }
	| { kind: 'fetching' }
	| { kind: 'failed'; message: string };

export default function MenuWindow() {
	const ipc = useIpc();
	const [githubState, setGitHubState] = useState<GitHubState>({ kind: 'idle' });
	const [joinCode, setJoinCode] = useState('');
	const [copied, setCopied] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);

	function startGitHubLogin() {
		setGitHubState({ kind: 'requesting' });
		setTimeout(() => {
			setGitHubState({ kind: 'awaiting', userCode: 'ABCD-1234' });
		}, 800);
	}

	function cancelGitHubLogin() {
		setGitHubState({ kind: 'idle' });
	}

	function copyCode(code: string) {
		navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	function rollCode() {
		const parts = Array.from({ length: 2 }, () =>
			Math.random().toString(36).slice(2, 6).toLowerCase()
		);
		setJoinCode(parts.join('-'));
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
						<div className="settings-popover glass">
							<button>About Munkel</button>
							<button>Check for Updates…</button>
							<button onClick={() => ipc.showPalette()}>Quick send…</button>
							<div className="popover-divider" />
							<button onClick={() => ipc.quitApp()}>Quit</button>
						</div>
					)}
				</div>
			</div>

			{circles.length === 0 && (
				<p className="hint">No circles yet. Create one or join with a code.</p>
			)}

			<div className="circle-list">
				{circles.map((circle) => (
					<div key={circle.code} className="circle-section">
						<div className="circle-header">
							<span
								className="status-dot"
								style={{ background: circle.isConnected ? '#34c759' : '#ff9f0a' }}
							/>
							<span className="circle-code">{circle.code}</span>
							<button className="icon-button" title="Copy code">
								📋
							</button>
							<div style={{ flex: 1 }} />
							<button className="icon-button" title="Leave circle">
								➡️
							</button>
						</div>

						{circle.members.length === 0 ? (
							<p className="caption">No one else online</p>
						) : (
							<div className="member-row">
								<div className="avatar-stack">
									{circle.members.slice(0, 8).map((m) => (
										<Avatar key={m.id} name={m.label} size={16} />
									))}
								</div>
								<span className="member-names">
									{circle.members.map((m) => m.label).join(', ')}
								</span>
							</div>
						)}

						<div className="send-row">
							<select className="frosted-field recipient-select">
								<option key="all">All</option>
								{circle.members.map((m) => (
									<option key={m.id}>{m.label}</option>
								))}
							</select>
							<input className="frosted-field" placeholder="Message…" />
							<button className="icon-button">➤</button>
						</div>
					</div>
				))}
			</div>

			<div className="divider" />

			<div className="join-area">
				<div className="join-row">
					<input
						className="frosted-field"
						placeholder="Your circle"
						value={joinCode}
						onChange={(e) => setJoinCode(e.target.value)}
					/>
					<button className="icon-button" title="Roll a random code" onClick={rollCode}>
						🎲
					</button>
					<button className="button-primary" disabled={!joinCode.trim()}>
						Join
					</button>
				</div>
				<p className="caption">If the circle doesn't exist yet, it's created.</p>
			</div>

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

			<div className="divider" />

			<GitHubArea
				state={githubState}
				onStart={startGitHubLogin}
				onCancel={cancelGitHubLogin}
				onCopy={copyCode}
				copied={copied}
			/>
		</div>
	);
}

interface GitHubAreaProps {
	state: GitHubState;
	onStart: () => void;
	onCancel: () => void;
	onCopy: (code: string) => void;
	copied: boolean;
}

function GitHubArea({ state, onStart, onCancel, onCopy, copied }: GitHubAreaProps) {
	switch (state.kind) {
		case 'idle':
			return (
				<div className="github-row">
					<button className="button-primary" onClick={onStart}>
						Sign in with GitHub
					</button>
				</div>
			);
		case 'requesting':
			return (
				<div className="github-row">
					<span className="spinner" />
					<span className="caption">Connecting to GitHub…</span>
				</div>
			);
		case 'awaiting':
			return (
				<div className="github-column">
					<div className="code-row">
						<span className="user-code">{state.userCode}</span>
						<button className="icon-button" onClick={() => onCopy(state.userCode)}>
							{copied ? '✓' : '📋'}
						</button>
						<button className="button-small" onClick={onCancel}>
							Cancel
						</button>
					</div>
					<p className="caption">
						{copied ? 'Code copied — paste it on github.com.' : 'Paste this code on github.com.'}
					</p>
				</div>
			);
		case 'fetching':
			return (
				<div className="github-row">
					<span className="spinner" />
					<span className="caption">Loading GitHub profile…</span>
				</div>
			);
		case 'failed':
			return (
				<div className="github-row">
					<span className="caption" style={{ color: '#ff453a' }}>
						{state.message}
					</span>
					<button className="button-small" onClick={onStart}>
						Retry
					</button>
				</div>
			);
	}
}
