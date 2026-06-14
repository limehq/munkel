import { useMemo, useState } from 'react';
import { recipients } from '../mock-data';
import { Avatar } from './Avatar';

export default function PaletteWindow() {
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [target, setTarget] = useState<(typeof recipients)[0] | null>(null);
	const [message, setMessage] = useState('');

	const filtered = useMemo(() => {
		const q = query.toLowerCase();
		return recipients.filter(
			(r) => r.label.toLowerCase().includes(q) || r.circle.toLowerCase().includes(q)
		);
	}, [query]);

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
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && message.trim()) {
								setMessage('');
								setTarget(null);
							}
							if (e.key === 'Escape') setTarget(null);
						}}
						autoFocus
					/>
					<button className="icon-button" disabled={!message.trim()} title="Send">
						➤
					</button>
				</div>
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
				{filtered.length === 0 ? (
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
