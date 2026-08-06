import { useMemo, useState } from 'react';
import { useAppStore } from '../store/app-store';
import { Avatar } from './Avatar';
import { clipboardEventHasImage, pasteClipboardImage } from '../lib/clipboard-image';

// Mirrors `MAX_IMAGES_PER_MESSAGE` in `core/image-codec.ts` — not imported
// directly to avoid pulling that module's Node-oriented deps (`image-size`,
// `@jsquash/avif`) into the renderer bundle for a single constant; the main
// process (`group-session.ts`) is the actual source of truth and already
// clamps the album server-side regardless of what the UI caps at.
const MAX_IMAGES_PER_MESSAGE = 8;

interface Recipient {
	id: string;
	label: string;
	circle: string;
	isEveryone: boolean;
	memberId?: string;
	circleCode: string;
}

export default function PaletteWindow() {
	const { state, sendChat, sendImages, selectImages } = useAppStore();
	const [query, setQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [target, setTarget] = useState<Recipient | null>(null);
	const [message, setMessage] = useState('');
	const [imagePaths, setImagePaths] = useState<string[]>([]);
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
				setImagePaths([]);
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

	async function handleAttachImages() {
		setError(null);
		try {
			const paths = await selectImages();
			if (paths && paths.length > 0) {
				setImagePaths((prev) => [...prev, ...paths].slice(0, MAX_IMAGES_PER_MESSAGE));
			}
		} catch (err) {
			console.error('[palette] select images failed', err);
		}
	}

	// Ctrl+V image paste (Plan 12 P3.4): if the clipboard holds an image,
	// attach it (via the same imagePaths flow as `handleAttachImages`) and
	// suppress the default text paste; otherwise leave the paste event
	// completely alone so normal text pasting is unaffected.
	//
	// preventDefault must be called synchronously (before the async image
	// fetch can resolve), so if the fetch then returns null — main-process
	// save failure, sender-guard rejection, or an image the pixel cap
	// rejected — the default paste can no longer happen. In that FAILURE
	// case the clipboard's text (captured synchronously below, together
	// with the caret position) is inserted manually at the caret so the
	// paste is never silently swallowed. When the image attach SUCCEEDS,
	// the text component of a mixed image+text clipboard (e.g. copied from
	// Word) is deliberately dropped — the image is the paste's payload;
	// attaching it AND pasting its serialized text form would duplicate
	// the content.
	async function handleMessagePaste(e: React.ClipboardEvent<HTMLInputElement>) {
		if (!clipboardEventHasImage(e) || imagePaths.length >= MAX_IMAGES_PER_MESSAGE || sending) return;
		const fallbackText = e.clipboardData?.getData('text/plain') ?? '';
		// Caret capture must also be synchronous — after the await the input
		// may have lost focus or moved. Missing selection info (never on a
		// real input; possible with synthetic test events) appends instead.
		const selStart = e.currentTarget?.selectionStart ?? null;
		const selEnd = e.currentTarget?.selectionEnd ?? selStart;
		e.preventDefault();
		const path = await pasteClipboardImage();
		if (path) {
			setImagePaths((prev) => [...prev, path].slice(0, MAX_IMAGES_PER_MESSAGE));
		} else if (fallbackText) {
			setMessage((prev) =>
				selStart === null
					? prev + fallbackText
					: prev.slice(0, selStart) + fallbackText + prev.slice(selEnd ?? selStart),
			);
		}
	}

	async function handleSend() {
		if (!target || sending) return;
		const text = message.trim();
		if (!text && imagePaths.length === 0) return;

		setSending(true);
		setError(null);
		try {
			const to = target.isEveryone ? undefined : target.memberId;
			let result: { ok: boolean; error?: string };
			if (imagePaths.length > 0) {
				result = await sendImages(target.circleCode, imagePaths, text, to);
			} else {
				result = await sendChat(target.circleCode, text, to);
			}
			if (!result.ok) {
				setError(result.error ?? 'Circle offline — message not sent.');
				return; // keep the text / images so the user can retry
			}
			setMessage('');
			setImagePaths([]);
			setTarget(null);
			setQuery('');
			setSelectedIndex(0);
			window.electronAPI.hideWindow();
		} finally {
			setSending(false);
		}
	}

	const canSend = (message.trim().length > 0 || imagePaths.length > 0) && !sending;

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
					<button
						className="icon-button"
						onClick={() => void handleAttachImages()}
						title="Attach images"
						disabled={imagePaths.length >= MAX_IMAGES_PER_MESSAGE || sending}
					>
						🖼️
					</button>
					<input
						className="frosted-field"
						placeholder={
							imagePaths.length > 0
								? `Caption ${imagePaths.length} image${imagePaths.length === 1 ? '' : 's'}…`
								: `Message ${target.label}…`
						}
						value={message}
						onChange={(e) => {
							setMessage(e.target.value);
							if (error) setError(null);
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && canSend) {
								void handleSend();
							}
							if (e.key === 'Escape') setTarget(null);
						}}
						onPaste={(e) => void handleMessagePaste(e)}
						autoFocus
					/>
					<button
						className="icon-button"
						disabled={!canSend}
						onClick={() => void handleSend()}
						title="Send"
					>
						➤
					</button>
				</div>
				{imagePaths.length > 0 && (
					<div className="image-attachments">
						{imagePaths.map((path, i) => (
							<span key={`${path}-${i}`} className="image-attachment-chip">
								{path.split(/[/\\]/).pop()}
								<button
									className="icon-button"
									onClick={() => setImagePaths((prev) => prev.filter((_, idx) => idx !== i))}
									title="Remove"
									disabled={sending}
								>
									×
								</button>
							</span>
						))}
					</div>
				)}
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
