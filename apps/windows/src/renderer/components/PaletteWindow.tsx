import { useMemo, useState } from 'react';
import { useAppStore } from '../store/app-store';
import { Avatar } from './Avatar';

interface Recipient {
	id: string;
	label: string;
	circle: string;
	isEveryone: boolean;
	memberId?: string;
	circleCode: string;
}

export default function PaletteWindow() {
	const { state, sendChat } = useAppStore();
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [target, setTarget] = useState<Recipient | null>(null);
	const [message, setMessage] = useState('');
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const recipients = useMemo<Recipient[]>(() => {
		const out: Recipient[] = [];
		for (const c of state.circles) {
			out.push({
				id: `all-${c.code}`,
				label: `Everyone in ${c.code}`,
				circle: c.code,
				isEveryone: true,
				circleCode: c.code,
			});
			for (const m of c.members) {
				out.push({
					id: m.memberId,
					label: m.displayName ?? m.memberId.slice(0, 8),
					circle: c.code,
					isEveryone: false,
					memberId: m.memberId,
					circleCode: c.code,
				});
			}
		}
		return out;
	}, [state.circles]);

	const filtered = useMemo(() => {
		const q = query.toLowerCase();
		return recipients.filter(
			(r) => r.label.toLowerCase().includes(q) || r.circle.toLowerCase().includes(q)
		);
	}, [recipients, query]);

	const safeSelectedIndex = filtered.length === 0 ? -1 : Math.min(selectedIndex, filtered.length - 1);

	function handleKeyDown(e: React.KeyboardEvent) {
		if (target) {
			if (e.key === 'Escape') {
				setTarget(null);
				setMessage('');
			}
			return;
		}

		if (e.key === 'ArrowDown') {
			setSelectedIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
		} else if (e.key === 'ArrowUp') {
			setSelectedIndex((i) => Math.max(i - 1, 0));
		} else if (e.key === 'Enter') {
			const selected = filtered[safeSelectedIndex];
			if (selected) {
				setTarget(selected);
				setQuery('');
				setSelectedIndex(0);
			}
		} else if (e.key === 'Escape') {
			window.electronAPI.hideWindow();
		}
	}

	async function handleSend() {
		if (!target || sending) return;
		const text = message.trim();
		if (!text) return;
		setSending(true);
		setError(null);
		try {
			const to = target.isEveryone ? undefined : target.memberId;
			const ok = await sendChat(target.circleCode, text, to);
			if (!ok) {
				setError('Circle offline — message not sent.');
				return; // keep the text so the user can retry
			}
			setMessage('');
			setTarget(null);
			setQuery('');
			setSelectedIndex(0);
			window.electronAPI.hideWindow();
		} finally {
			setSending(false);
		}
	}

	if (target) {
		return (
			<div className="palette glass">
				<div className="palette-header">
					<button className="icon-button" onClick={() => setTarget(null)} title="Back">
						←
					</button>
					<Avatar name={target.label} size={22} isEveryone={target.isEveryone} />
					<span className="target-name">{target.label}</span>
					<span className="circle-name">{target.circle}</span>
				</div>
				<div className="palette-divider" />
				<div className="compose-row">
					<input
						className="frosted-field"
						placeholder={`Message ${target.label}…`}
						value={message}
						onChange={(e) => {
							setMessage(e.target.value);
							if (error) setError(null);
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && message.trim() && !sending) {
								void handleSend();
							}
							if (e.key === 'Escape') setTarget(null);
						}}
						autoFocus
					/>
					<button
						className="icon-button"
						disabled={!message.trim() || sending}
						onClick={() => void handleSend()}
						title="Send"
					>
						➤
					</button>
				</div>
				{error && <p className="compose-error">{error}</p>}
			</div>
		);
	}

	return (
		<div className="palette glass">
			<div className="palette-search">
				<span className="search-icon">➤</span>
				<input
					className="frosted-field"
					placeholder="Send to… (name or circle)"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setSelectedIndex(0);
					}}
					onKeyDown={handleKeyDown}
					autoFocus
				/>
			</div>
			<div className="palette-divider" />
			<div className="recipient-list">
				{state.circles.length === 0 ? (
					<div className="empty-state">
						<span className="caption">
							No circles joined yet. Open the Munkel menu and join or create one.
						</span>
					</div>
				) : filtered.length === 0 ? (
					<div className="empty-state">
						<span className="caption">No matches.</span>
					</div>
				) : (
					filtered.map((r, i) => (
						<div
							key={r.id}
							className={`recipient-row ${i === safeSelectedIndex ? 'selected' : ''}`}
							onClick={() => setTarget(r)}
							onMouseEnter={() => setSelectedIndex(i)}
						>
							<Avatar name={r.label} size={24} isEveryone={r.isEveryone} />
							<span className="recipient-label">{r.label}</span>
							<span className="recipient-circle">{r.circle}</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
