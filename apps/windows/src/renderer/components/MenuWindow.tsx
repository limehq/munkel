import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/app-store';
import { Avatar } from './Avatar';
import { getCircleColor } from '../../shared/group-color';
import { clipboardEventHasImage, pasteClipboardImage } from '../lib/clipboard-image';
import { acceleratorFromKeyboardEvent } from '../lib/hotkey-recorder';
import { DEFAULT_PALETTE_HOTKEY, formatAcceleratorLabel } from '../../shared/accelerator';
import { MAX_MESSAGE_CHARS, clampMessageText } from '@munkel/shared-wire/message-limits';
import type { CircleState, GitHubLoginState, IdentityState, Member, PresenceStatus, UpdateState } from '../../shared/types';

// Feedback window for the "Copy code" button's checkmark (Plan 12 "Menu:
// copy circle code button"), matching the copy-button pattern already used
// for the notch's message copy button (`COPY_FEEDBACK_MS` in
// `useNotchLifecycle.ts`).
const CODE_COPY_FEEDBACK_MS = 1_500;

// Mirrors `MAX_IMAGES_PER_MESSAGE` in `core/image-codec.ts` (see
// PaletteWindow.tsx for why it's a local copy, not an import).
const MAX_IMAGES_PER_MESSAGE = 8;

export default function MenuWindow() {
	const {
		state,
		joinCircle,
		leaveCircle,
		sendChat,
		sendImages,
		selectImages,
		updateProfile,
		setPresenceStatus,
		startGitHubLogin,
		cancelGitHubLogin,
		githubLogout,
		checkForUpdates,
		installUpdate,
		confirmInstallUpdate,
		cancelInstallUpdate,
		getLaunchAtLogin,
		setLaunchAtLogin,
		getAutoUpdateCheck,
		setAutoUpdateCheck,
		getPaletteHotkey,
		setPaletteHotkey,
		isDev,
		getAllowInScreenshots,
		setAllowInScreenshots,
		getDevEchoBroadcasts,
		setDevEchoBroadcasts,
	} = useAppStore();

	const [joinCode, setJoinCode] = useState('');
	const [joinRelay, setJoinRelay] = useState('');
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [confirmingLeave, setConfirmingLeave] = useState<string | null>(null);
	const [displayName, setDisplayName] = useState(state.identity?.displayName ?? '');
	const [messages, setMessages] = useState<Record<string, string>>({});
	const [recipients, setRecipients] = useState<Record<string, string>>({});
	const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
	// Image attachments per circle (Plan 12 P3.4), keyed the same way as
	// `messages`/`recipients` — one compose row per circle, so each needs its
	// own pending-attachment list.
	const [imageAttachments, setImageAttachments] = useState<Record<string, string[]>>({});
	// Circles with a send currently in flight. A ref (not state) because it
	// is only read imperatively — by handleSend's double-send guard and by
	// the paste handler — never for rendering. Mirrors PaletteWindow's
	// `sending` flag, scoped per circle since each row sends independently.
	const sendingCirclesRef = useRef(new Set<string>());
	// Tracks the last name *successfully persisted* via updateProfile so an
	// unchanged name is never re-submitted (E2). Because this ref is only
	// committed once the IPC promise resolves, it does NOT by itself protect
	// against Enter + blur firing in the same interaction — that synchronous
	// double-submit is suppressed by inFlightNameRef below.
	const lastSavedNameRef = useRef(state.identity?.displayName ?? '');
	// Name currently being saved. Set synchronously at submit time so the
	// blur that immediately follows an Enter commit (Enter commits, then the
	// input blurs) sees the name as already in flight and does not start a
	// duplicate updateProfile call. Cleared when the latest submit settles;
	// cleared on rejection too, so a retry with the same name goes through.
	const inFlightNameRef = useRef<string | null>(null);
	// Monotonic counter for in-flight updateProfile(name) calls. If two
	// submits race (e.g. Enter then a fast retry) and resolve out of order,
	// only the settle whose generation matches the *latest* submit is allowed
	// to mutate lastSavedNameRef / inFlightNameRef / surface an error, so a
	// late-arriving settle for a stale submit can never clobber a newer one.
	const nameSaveGenerationRef = useRef(0);
	// Timer that auto-hides the save-failed hint a few seconds after it
	// appears, and a flag driving that hint's visibility.
	const nameSaveErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [nameSaveFailed, setNameSaveFailed] = useState(false);
	// Opt-in autostart (Plan 12 P2.1). Default false — mirrors the persisted
	// main-process value fetched on mount, not applied speculatively.
	const [launchAtLogin, setLaunchAtLoginState] = useState(false);
	// In-flight guard for the autostart toggle (same idea as inFlightNameRef
	// for the display-name save): a rapid double-click must not fire a second
	// setLaunchAtLogin IPC call while the first is still unresolved, or an
	// out-of-order resolve could snap the checkbox to a stale value.
	const launchToggleInFlightRef = useRef(false);
	// Auto-update "Check Automatically" toggle (Plan 12 P3.7). Default true —
	// mirrors the persisted main-process value fetched on mount, matching
	// today's unconditional-check behavior until that fetch resolves.
	const [autoUpdateCheck, setAutoUpdateCheckState] = useState(true);
	// Same race-guard pattern as launchToggleInFlightRef.
	const autoUpdateToggleInFlightRef = useRef(false);

	// Dev-only settings-popover toggles (Plan 13 items 5–6). `isDevBuild`
	// gates whether the two toggles below render at all — fetched once on
	// mount; a packaged build's main process resolves `isDev()` to `false`,
	// so the checkboxes and their IPC calls never appear/fire there.
	const [isDevBuild, setIsDevBuild] = useState(false);
	// "Allow in screenshots" (mirrors macOS `CaptureScreenshotPreference`,
	// default off). Same optimistic-toggle-then-snap-back-on-failure pattern
	// as launchAtLogin/autoUpdateCheck above.
	const [allowInScreenshots, setAllowInScreenshotsState] = useState(false);
	const allowInScreenshotsToggleInFlightRef = useRef(false);
	// "Echo my broadcasts to me" — opt-in (default off); hydrated from main
	// via getDevEchoBroadcasts on mount.
	const [devEchoBroadcasts, setDevEchoBroadcastsState] = useState(false);
	const devEchoBroadcastsToggleInFlightRef = useRef(false);

	// Rebindable palette hotkey (Plan 12 P3.1). Default mirrors the persisted
	// main-process value fetched on mount (same posture as the toggles above).
	// `null` = the hotkey is currently UNBOUND (startup registration failed,
	// or a rebind's rollback also failed — the "rollback-failed" double
	// failure). The recorder then shows "Not bound" instead of pretending an
	// unregistered combo is active; a later successful capture heals the
	// state without a restart (commitPaletteHotkey never early-outs against
	// null, since no string equals it).
	const [paletteHotkey, setPaletteHotkeyState] = useState<string | null>(DEFAULT_PALETTE_HOTKEY);
	const [hotkeyRecording, setHotkeyRecording] = useState(false);
	// In-flight guard for the recorder (same idea as launchToggleInFlightRef):
	// a fast second keypress must not fire a second setPaletteHotkey IPC call
	// while the first is still unresolved.
	const hotkeySaveInFlightRef = useRef(false);
	const [hotkeySaveError, setHotkeySaveError] = useState<string | null>(null);
	const hotkeyErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		let mounted = true;
		void getPaletteHotkey().then((accelerator) => {
			if (mounted) setPaletteHotkeyState(accelerator);
		});
		return () => {
			mounted = false;
		};
	}, [getPaletteHotkey]);

	useEffect(() => {
		return () => {
			if (hotkeyErrorTimeoutRef.current) clearTimeout(hotkeyErrorTimeoutRef.current);
		};
	}, []);

	function clearHotkeyError() {
		if (hotkeyErrorTimeoutRef.current) {
			clearTimeout(hotkeyErrorTimeoutRef.current);
			hotkeyErrorTimeoutRef.current = null;
		}
		setHotkeySaveError(null);
	}

	/**
	 * Attempts to rebind the palette hotkey to `accelerator`. Always trusts
	 * the main process's returned `accelerator` for the displayed value —
	 * `rebindPaletteHotkey` rolls back to the previous binding on failure, so
	 * echoing that back (rather than assuming the request took effect) keeps
	 * the recorder's display accurate even when the rebind was rejected.
	 */
	async function commitPaletteHotkey(accelerator: string) {
		if (hotkeySaveInFlightRef.current) return;
		if (accelerator === paletteHotkey) {
			setHotkeyRecording(false);
			return;
		}
		hotkeySaveInFlightRef.current = true;
		clearHotkeyError();
		try {
			const result = await setPaletteHotkey(accelerator);
			// Always display what the main process confirms is bound — the new
			// combo, the rolled-back old one, the healed default, or null
			// (unbound) after a rollback-failed double failure. Never intent.
			setPaletteHotkeyState(result.accelerator);
			if (!result.ok) {
				setHotkeySaveError(
					result.error === 'invalid-accelerator'
						? 'Invalid shortcut — hold Ctrl, Alt, or Win plus a key'
						: result.error === 'rollback-failed'
							? 'Shortcut could not be bound — record a new combination (or restart the app)'
							: 'Shortcut already in use by another app — try a different combo',
				);
				hotkeyErrorTimeoutRef.current = setTimeout(() => {
					setHotkeySaveError(null);
					hotkeyErrorTimeoutRef.current = null;
				}, 4000);
			}
		} finally {
			hotkeySaveInFlightRef.current = false;
			setHotkeyRecording(false);
		}
	}

	function handleHotkeyRecorderKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
		if (e.key === 'Escape') {
			// Cancel without committing — matches the task's "Escape bricht ab".
			e.preventDefault();
			e.currentTarget.blur();
			return;
		}
		e.preventDefault();
		if (hotkeySaveInFlightRef.current) return;
		const accelerator = acceleratorFromKeyboardEvent(e);
		// A bare modifier press (e.g. just Ctrl) or an unsupported key (e.g.
		// CapsLock) resolves to null — keep waiting for a real combo instead
		// of committing or erroring.
		if (!accelerator) return;
		void commitPaletteHotkey(accelerator);
	}

	useEffect(() => {
		let mounted = true;
		void getLaunchAtLogin().then((enabled) => {
			if (mounted) setLaunchAtLoginState(enabled);
		});
		return () => {
			mounted = false;
		};
	}, [getLaunchAtLogin]);

	useEffect(() => {
		let mounted = true;
		void getAutoUpdateCheck().then((enabled) => {
			if (mounted) setAutoUpdateCheckState(enabled);
		});
		return () => {
			mounted = false;
		};
	}, [getAutoUpdateCheck]);

	// Dev-only flag + toggles (Plan 13 items 5–6). The two toggle values are
	// only fetched once `isDev()` confirms this is a dev build, so a
	// packaged build never issues the GET_ALLOW_IN_SCREENSHOTS /
	// GET_DEV_ECHO_BROADCASTS IPC calls at all (its main process would
	// refuse them anyway — see main.ts's `isDev` gate — but there's no
	// reason to even ask).
	useEffect(() => {
		let mounted = true;
		void isDev().then((dev) => {
			if (mounted) setIsDevBuild(dev);
		});
		return () => {
			mounted = false;
		};
	}, [isDev]);

	useEffect(() => {
		if (!isDevBuild) return;
		let mounted = true;
		void getAllowInScreenshots().then((enabled) => {
			if (mounted) setAllowInScreenshotsState(enabled);
		});
		void getDevEchoBroadcasts().then((enabled) => {
			if (mounted) setDevEchoBroadcastsState(enabled);
		});
		return () => {
			mounted = false;
		};
	}, [isDevBuild, getAllowInScreenshots, getDevEchoBroadcasts]);

	async function handleToggleLaunchAtLogin() {
		if (launchToggleInFlightRef.current) return;
		launchToggleInFlightRef.current = true;
		const next = !launchAtLogin;
		// Optimistic update, matching macOS's toggle-then-snap-back-on-failure
		// binding (`try?` around `LoginItem.setEnabled`).
		setLaunchAtLoginState(next);
		try {
			const ok = await setLaunchAtLogin(next);
			if (!ok) setLaunchAtLoginState(!next);
		} finally {
			launchToggleInFlightRef.current = false;
		}
	}

	async function handleToggleAutoUpdateCheck() {
		if (autoUpdateToggleInFlightRef.current) return;
		autoUpdateToggleInFlightRef.current = true;
		const next = !autoUpdateCheck;
		setAutoUpdateCheckState(next);
		try {
			const ok = await setAutoUpdateCheck(next);
			if (!ok) setAutoUpdateCheckState(!next);
		} finally {
			autoUpdateToggleInFlightRef.current = false;
		}
	}

	async function handleToggleAllowInScreenshots() {
		if (allowInScreenshotsToggleInFlightRef.current) return;
		allowInScreenshotsToggleInFlightRef.current = true;
		const next = !allowInScreenshots;
		setAllowInScreenshotsState(next);
		try {
			const ok = await setAllowInScreenshots(next);
			if (!ok) setAllowInScreenshotsState(!next);
		} finally {
			allowInScreenshotsToggleInFlightRef.current = false;
		}
	}

	async function handleToggleDevEchoBroadcasts() {
		if (devEchoBroadcastsToggleInFlightRef.current) return;
		devEchoBroadcastsToggleInFlightRef.current = true;
		const next = !devEchoBroadcasts;
		setDevEchoBroadcastsState(next);
		try {
			const ok = await setDevEchoBroadcasts(next);
			if (!ok) setDevEchoBroadcastsState(!next);
		} finally {
			devEchoBroadcastsToggleInFlightRef.current = false;
		}
	}

	useEffect(() => {
		if (state.identity) {
			setDisplayName(state.identity.displayName);
			lastSavedNameRef.current = state.identity.displayName;
		}
	}, [state.identity?.displayName]);

	useEffect(() => {
		if (confirmingLeave && !state.circles.some((c) => c.code === confirmingLeave)) {
			setConfirmingLeave(null);
		}
	}, [state.circles, confirmingLeave]);

	useEffect(() => {
		return () => {
			if (nameSaveErrorTimeoutRef.current) {
				clearTimeout(nameSaveErrorTimeoutRef.current);
			}
		};
	}, []);

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
		if (sendingCirclesRef.current.has(code)) return;
		const text = messages[code]?.trim() ?? '';
		const images = imageAttachments[code] ?? [];
		if (!text && images.length === 0) return;
		const to = recipients[code] || undefined;
		sendingCirclesRef.current.add(code);
		try {
			const result = images.length > 0
				? await sendImages(code, images, text, to)
				: await sendChat(code, text, to);
			if (result.ok) {
				setMessages((prev) => ({ ...prev, [code]: '' }));
				setImageAttachments((prev) => ({ ...prev, [code]: [] }));
				setSendErrors((prev) => ({ ...prev, [code]: '' }));
			} else {
				setSendErrors((prev) => ({
					...prev,
					[code]: result.error ?? 'Circle offline — message not sent.',
				}));
			}
		} finally {
			sendingCirclesRef.current.delete(code);
		}
	}

	async function handleAttachImages(code: string) {
		try {
			const paths = await selectImages();
			if (paths && paths.length > 0) {
				setImageAttachments((prev) => ({
					...prev,
					[code]: [...(prev[code] ?? []), ...paths].slice(0, MAX_IMAGES_PER_MESSAGE),
				}));
			}
		} catch (err) {
			console.error('[menu] select images failed', err);
		}
	}

	function handleRemoveImage(code: string, index: number) {
		setImageAttachments((prev) => ({
			...prev,
			[code]: (prev[code] ?? []).filter((_, i) => i !== index),
		}));
	}

	// Ctrl+V image paste (Plan 12 P3.4) — same contract as PaletteWindow's
	// handleMessagePaste: attach the clipboard image if present and suppress
	// the default text paste, otherwise leave the paste event alone. Skipped
	// while a send for this circle is in flight (mirrors the palette's
	// `sending` guard) so an attachment can't slip into an album that is
	// being cleared by an about-to-resolve successful send. If the image
	// fetch returns null after preventDefault (save failure, pixel-cap
	// rejection), the synchronously captured clipboard text is inserted
	// manually at the (also synchronously captured) caret so the paste is
	// never silently swallowed; on a SUCCESSFUL image attach the text
	// component of a mixed image+text clipboard is deliberately dropped —
	// the image is the paste's payload (see PaletteWindow's comment).
	async function handleMessagePaste(code: string, e: React.ClipboardEvent<HTMLInputElement>) {
		const current = imageAttachments[code] ?? [];
		if (!clipboardEventHasImage(e) || current.length >= MAX_IMAGES_PER_MESSAGE) return;
		if (sendingCirclesRef.current.has(code)) return;
		const fallbackText = e.clipboardData?.getData('text/plain') ?? '';
		const selStart = e.currentTarget?.selectionStart ?? null;
		const selEnd = e.currentTarget?.selectionEnd ?? selStart;
		e.preventDefault();
		const path = await pasteClipboardImage();
		if (path) {
			setImageAttachments((prev) => ({
				...prev,
				[code]: [...(prev[code] ?? []), path].slice(0, MAX_IMAGES_PER_MESSAGE),
			}));
		} else if (fallbackText) {
			setMessages((prev) => {
				const existing = prev[code] ?? '';
				const next =
					selStart === null
						? existing + fallbackText
						: existing.slice(0, selStart) + fallbackText + existing.slice(selEnd ?? selStart);
				// Clamp the manually-inserted paste to the 2048 cap. The normal
				// onChange path already clamps typed/pasted text, but this branch
				// writes `messages[code]` directly (bypassing onChange), so without
				// this the fallback text could push the composer over the cap — and
				// since outgoing text is not clamped at the session layer, handleSend
				// would then send an over-length message.
				return { ...prev, [code]: clampMessageText(next) };
			});
		}
	}

	function clearNameSaveError() {
		if (nameSaveErrorTimeoutRef.current) {
			clearTimeout(nameSaveErrorTimeoutRef.current);
			nameSaveErrorTimeoutRef.current = null;
		}
		setNameSaveFailed(false);
	}

	function updateName() {
		const name = displayName.trim();
		// Skip no-op changes (already persisted) and duplicate submits of a
		// name whose save is still in flight (Enter + the blur it triggers).
		if (!name || name === lastSavedNameRef.current || name === inFlightNameRef.current) return;

		// Bump the generation before firing the IPC call and capture it in the
		// closure below. If a newer submit starts before this one settles, its
		// resolve/reject is stale and must not touch lastSavedNameRef,
		// inFlightNameRef, or the error UI (out-of-order-resolve guard).
		const generation = ++nameSaveGenerationRef.current;
		inFlightNameRef.current = name;

		// Clear any stale error hint from a previous failed attempt as soon as
		// a new save starts; the retry is now in flight.
		clearNameSaveError();

		// Only mark this name as "saved" once the IPC call actually resolves.
		// If updateProfile rejects (e.g. relay offline), lastSavedNameRef stays
		// at its previous value so a retry with the same name is not silently
		// dropped as a no-op change.
		void updateProfile(name).then(
			() => {
				if (nameSaveGenerationRef.current !== generation) return;
				lastSavedNameRef.current = name;
				inFlightNameRef.current = null;
				// A save that lands while the error hint is still visible proves
				// the problem is gone — dismiss the hint immediately.
				clearNameSaveError();
			},
			() => {
				if (nameSaveGenerationRef.current !== generation) return;
				// Leave lastSavedNameRef untouched and release the in-flight slot
				// so the same name can be retried, then surface a brief hint so
				// the failure isn't silent (the field stays editable throughout).
				inFlightNameRef.current = null;
				setNameSaveFailed(true);
				nameSaveErrorTimeoutRef.current = setTimeout(() => {
					setNameSaveFailed(false);
					nameSaveErrorTimeoutRef.current = null;
				}, 4000);
			},
		);
	}

	function commitNameOnEnter(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key !== 'Enter') return;
		// Prevent any implicit form behavior and commit immediately, matching
		// macOS's "Enter commits the display name" (E2). Blurring afterward is
		// safe: the blur's updateName() sees the name in inFlightNameRef (set
		// synchronously by this commit) and is a no-op.
		e.preventDefault();
		updateName();
		e.currentTarget.blur();
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
							<StatusSection
								identity={state.identity}
								onSetPresenceStatus={setPresenceStatus}
							/>
							<div className="popover-divider" />
							<label className="caption" style={{ display: 'block', marginBottom: 4 }}>
								Display name
							</label>
							<input
								className="frosted-field"
								data-testid="display-name-input"
								value={displayName}
								onChange={(e) => setDisplayName(e.target.value)}
								onBlur={updateName}
								onKeyDown={commitNameOnEnter}
								placeholder="Your name"
							/>
							{nameSaveFailed && (
								<p className="name-save-error" data-testid="display-name-error">
									Saving failed — press Enter to retry
								</p>
							)}
							<div className="popover-divider" />
							<label className="launch-at-login-row" data-testid="launch-at-login-row">
								<input
									type="checkbox"
									data-testid="launch-at-login-checkbox"
									checked={launchAtLogin}
									onChange={handleToggleLaunchAtLogin}
								/>
								Launch at login
							</label>
							{isDevBuild && (
								<>
									<div className="popover-divider" />
									<label className="launch-at-login-row" data-testid="dev-echo-broadcasts-row">
										<input
											type="checkbox"
											data-testid="dev-echo-broadcasts-checkbox"
											checked={devEchoBroadcasts}
											onChange={handleToggleDevEchoBroadcasts}
										/>
										Echo my broadcasts to me
									</label>
									<label className="launch-at-login-row" data-testid="allow-in-screenshots-row">
										<input
											type="checkbox"
											data-testid="allow-in-screenshots-checkbox"
											checked={allowInScreenshots}
											onChange={handleToggleAllowInScreenshots}
										/>
										Allow in screenshots
									</label>
								</>
							)}
							<div className="popover-divider" />
							<label className="launch-at-login-row" data-testid="auto-update-check-row">
								<input
									type="checkbox"
									data-testid="auto-update-check-checkbox"
									checked={autoUpdateCheck}
									onChange={handleToggleAutoUpdateCheck}
								/>
								Check Automatically
							</label>
							<div className="popover-divider" />
							<label className="caption" style={{ display: 'block', marginBottom: 4 }}>
								Palette hotkey
							</label>
							<div className="hotkey-recorder-row">
								<button
									type="button"
									className="frosted-field hotkey-recorder"
									data-testid="palette-hotkey-recorder"
									onFocus={() => setHotkeyRecording(true)}
									onBlur={() => setHotkeyRecording(false)}
									onKeyDown={handleHotkeyRecorderKeyDown}
								>
									{hotkeyRecording
									? 'Press a key combo…'
									: paletteHotkey
										? formatAcceleratorLabel(paletteHotkey)
										: 'Not bound — press to record'}
								</button>
								<button
									type="button"
									className="icon-button"
									data-testid="palette-hotkey-reset"
									title="Reset to default"
									disabled={paletteHotkey === DEFAULT_PALETTE_HOTKEY}
									onClick={() => void commitPaletteHotkey(DEFAULT_PALETTE_HOTKEY)}
								>
									↺
								</button>
							</div>
							{hotkeySaveError && (
								<p className="name-save-error" data-testid="palette-hotkey-error">
									{hotkeySaveError}
								</p>
							)}
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

			<UpdateStatus
				state={state.updateState}
				onCheck={() => void checkForUpdates()}
				onInstall={() => void installUpdate()}
				onConfirmInstall={() => void confirmInstallUpdate()}
				onCancelInstall={() => void cancelInstallUpdate()}
			/>

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
						imagePaths={imageAttachments[circle.code] ?? []}
						onMessageChange={(text) => {
							// 2048-char clamp (Plan 12 "Menu: message character limit"),
							// mirroring macOS `MessageLimits.maxCharacters`. Clamped here
							// rather than only via the input's `maxLength` so pasted text
							// (which some environments deliver via a synthetic value
							// assignment rather than native maxLength enforcement) is
							// clamped too.
							setMessages((prev) => ({ ...prev, [circle.code]: clampMessageText(text) }))
							if (sendErrors[circle.code]) {
								setSendErrors((prev) => ({ ...prev, [circle.code]: '' }))
							}
						}}
						onRecipientChange={(to) =>
							setRecipients((prev) => ({ ...prev, [circle.code]: to }))
						}
						onSend={() => handleSend(circle.code)}
						onLeave={() => setConfirmingLeave(circle.code)}
						onAttachImages={() => void handleAttachImages(circle.code)}
						onRemoveImage={(index) => handleRemoveImage(circle.code, index)}
						onPaste={(e) => void handleMessagePaste(circle.code, e)}
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
				<span className="hotkey">{paletteHotkey ? formatAcceleratorLabel(paletteHotkey) : 'Not bound'}</span>
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

interface StatusSectionProps {
	identity: IdentityState | null;
	onSetPresenceStatus: (status: PresenceStatus) => Promise<void>;
}

const STATUS_OPTIONS: { value: PresenceStatus; label: string }[] = [
	{ value: 'online', label: 'Online' },
	{ value: 'dnd', label: 'Do Not Disturb' },
	{ value: 'away', label: 'Away' },
];

function StatusSection({ identity, onSetPresenceStatus }: StatusSectionProps) {
	const localStatus = identity?.presenceStatus ?? 'online';
	const effectiveStatus = identity?.effectiveStatus ?? 'online';
	const isAutoAway = effectiveStatus === 'away' && localStatus === 'online';

	async function handleChange(value: PresenceStatus) {
		await onSetPresenceStatus(value);
	}

	const displayName = identity?.displayName?.trim() || 'You';

	return (
		<div className="status-section">
			<div className="status-row">
				<Avatar
					name={displayName}
					imageBase64={identity?.avatar}
					status={effectiveStatus}
					size={34}
				/>
				<div className="status-copy">
					<strong>{displayName}</strong>
					{isAutoAway && <span className="caption status-auto">Away — auto</span>}
				</div>
			</div>
			<div className="status-picker">
				{STATUS_OPTIONS.map((option) => (
					<button
						key={option.value}
						className={`status-option ${localStatus === option.value ? 'status-option-active' : ''}`}
						onClick={() => void handleChange(option.value)}
						title={option.label}
					>
						<span
							className="status-dot"
							style={{
								background:
									option.value === 'online'
										? '#34c759'
										: option.value === 'dnd'
											? '#ff9f0a'
											: '#ff453a',
							}}
						/>
						<span className="status-label">{option.label}</span>
					</button>
				))}
			</div>
		</div>
	);
}

function UpdateStatus({
	state,
	onCheck,
	onInstall,
	onConfirmInstall,
	onCancelInstall,
}: {
	state: UpdateState;
	onCheck: () => void;
	onInstall: () => void;
	onConfirmInstall: () => void;
	onCancelInstall: () => void;
}) {
	if (state.phase === 'idle') return null;

	const labels: Record<Exclude<UpdateState['phase'], 'idle'>, string> = {
		checking: 'Checking for updates…',
		available: `Update available${state.version ? ` (v${state.version})` : ''}`,
		downloading: state.progress !== undefined ? `Downloading update… ${Math.round(state.progress)}%` : 'Downloading update…',
		downloaded: `Update ready${state.version ? ` (v${state.version})` : ''}`,
		confirm: `Update ready${state.version ? ` (v${state.version})` : ''} — restart required`,
		error: state.error ?? 'Update error',
	};

	const isError = state.phase === 'error';
	const isDownloaded = state.phase === 'downloaded';
	const isConfirm = state.phase === 'confirm';

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
			{isConfirm && (
				<>
					<button className="button-small" onClick={onConfirmInstall}>
						Install now
					</button>
					<button className="button-small" onClick={onCancelInstall}>
						Later
					</button>
				</>
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
	/** Pending image attachments for this circle's compose row (Plan 12 P3.4). */
	imagePaths: string[];
	onMessageChange: (text: string) => void;
	onRecipientChange: (to: string) => void;
	onSend: () => void;
	onLeave: () => void;
	onAttachImages: () => void;
	onRemoveImage: (index: number) => void;
	onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}

function CircleSection({
	circle,
	colorIndex,
	message,
	recipient,
	sendError,
	imagePaths,
	onMessageChange,
	onRecipientChange,
	onSend,
	onLeave,
	onAttachImages,
	onRemoveImage,
	onPaste,
}: CircleSectionProps) {
	const color = useMemo(() => getCircleColor(colorIndex), [colorIndex]);
	// Copy-code feedback (Plan 12 "Menu: copy circle code button"), mirroring
	// macOS `MenuView.swift`'s header copy button next to the code. Local to
	// this card — purely transient UI state, no need to lift it to the
	// parent (unlike message/recipient/error, which persist per circle
	// across MenuWindow re-renders).
	const [codeCopied, setCodeCopied] = useState(false);
	const codeCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (codeCopyTimeoutRef.current) clearTimeout(codeCopyTimeoutRef.current);
		};
	}, []);

	async function handleCopyCode(e: React.MouseEvent) {
		// Stop the click from bubbling to the menu-window root's onClick, which
		// closes the settings popover — copying a code shouldn't dismiss it.
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(circle.code);
		} catch {
			// Clipboard write was denied/failed — don't show a success checkmark
			// for a copy that didn't happen.
			return;
		}
		setCodeCopied(true);
		if (codeCopyTimeoutRef.current) clearTimeout(codeCopyTimeoutRef.current);
		codeCopyTimeoutRef.current = setTimeout(() => {
			setCodeCopied(false);
			codeCopyTimeoutRef.current = null;
		}, CODE_COPY_FEEDBACK_MS);
	}

	return (
		<div className="circle-section">
			<div className="circle-header">
				<span className="status-dot" style={{ background: circle.isConnected ? '#34c759' : '#ff9f0a' }} />
				<span className="circle-code">{circle.code}</span>
				<span
					className="circle-dot"
					style={{ background: color, width: 8, height: 8, borderRadius: '50%', marginLeft: 4 }}
				/>
				<button
					className="icon-button copy-code-button"
					title="Copy code"
					aria-label={`Copy circle code ${circle.code}`}
					data-testid={`copy-code-button-${circle.code}`}
					onClick={(e) => void handleCopyCode(e)}
				>
					{codeCopied ? '✓' : '📋'}
				</button>
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
								imageBase64={m.avatar}
								imageURL={m.avatarURL}
								status={m.status}
								size={16}
							/>
						))}
					</div>
					<span className="member-names">
						{circle.members.map((m) => m.displayName ?? m.memberId.slice(0, 8)).join(', ')}
					</span>
				</div>
			)}

			<RecipientChipRow
				members={circle.members}
				recipient={recipient}
				onRecipientChange={onRecipientChange}
			/>

			<div className="send-row">
				<button
					className="icon-button"
					onClick={onAttachImages}
					title="Attach images"
					disabled={imagePaths.length >= 8}
				>
					🖼️
				</button>
				<input
					className="frosted-field"
					placeholder={
						imagePaths.length > 0
							? `Caption ${imagePaths.length} image${imagePaths.length === 1 ? '' : 's'}…`
							: 'Message…'
					}
					value={message}
					maxLength={MAX_MESSAGE_CHARS}
					onChange={(e) => onMessageChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') onSend();
					}}
					onPaste={onPaste}
				/>
				<button className="icon-button" onClick={onSend} disabled={!message.trim() && imagePaths.length === 0}>
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
								onClick={() => onRemoveImage(i)}
								title="Remove"
							>
								×
							</button>
						</span>
					))}
				</div>
			)}
			{sendError && <p className="compose-error">{sendError}</p>}
		</div>
	);
}

interface RecipientChipRowProps {
	members: Member[];
	recipient: string;
	onRecipientChange: (to: string) => void;
}

/**
 * Avatar-chip recipient picker (Plan 12 P2.4), matching macOS `TargetChip`
 * in `MenuView.swift`: a globe chip for "everyone" plus one avatar+name chip
 * per member, horizontally scrollable, click-to-select. Replaces the native
 * `<select>`; the selection contract (`onRecipientChange('')` = All,
 * `onRecipientChange(memberId)` = one member) is unchanged.
 *
 * Accessibility: exposed as a radiogroup (single-select semantics like the
 * old `<select>`) with roving tabindex — Tab lands on the selected chip only,
 * and the Arrow keys move the selection (with wrap-around) while following
 * focus, per the WAI-ARIA radio-group pattern.
 */
function RecipientChipRow({ members, recipient, onRecipientChange }: RecipientChipRowProps) {
	// '' (= everyone) first, then one entry per member — the roving order.
	const values = ['', ...members.map((m) => m.memberId)];
	// Roving-tabindex anchor. If the selected member went offline (stale
	// recipient not in the row anymore), fall back to the "All" chip so the
	// row always keeps exactly one Tab stop.
	const tabStopValue = values.includes(recipient) ? recipient : '';
	const chipRefs = useRef(new Map<string, HTMLButtonElement>());

	function selectAndFocus(value: string) {
		onRecipientChange(value);
		chipRefs.current.get(value)?.focus();
	}

	function handleChipKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, currentValue: string) {
		let delta: number;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			delta = 1;
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			delta = -1;
		} else {
			return;
		}
		e.preventDefault();
		const index = values.indexOf(currentValue);
		if (index === -1) return;
		selectAndFocus(values[(index + delta + values.length) % values.length]);
	}

	function chipRef(value: string) {
		return (node: HTMLButtonElement | null) => {
			if (node) {
				chipRefs.current.set(value, node);
			} else {
				chipRefs.current.delete(value);
			}
		};
	}

	return (
		<div className="recipient-row" role="radiogroup" aria-label="Recipient" data-testid="recipient-row">
			<button
				type="button"
				role="radio"
				ref={chipRef('')}
				className={`recipient-chip${recipient === '' ? ' selected' : ''}`}
				title="Everyone"
				aria-label="Everyone"
				aria-checked={recipient === ''}
				tabIndex={tabStopValue === '' ? 0 : -1}
				data-testid="recipient-chip-all"
				onClick={() => onRecipientChange('')}
				onKeyDown={(e) => handleChipKeyDown(e, '')}
			>
				<span className="recipient-chip-globe" aria-hidden="true">
					🌐
				</span>
			</button>

			{members.map((m) => {
				const label = m.displayName ?? m.memberId.slice(0, 8);
				const selected = recipient === m.memberId;
				return (
					<button
						key={m.memberId}
						type="button"
						role="radio"
						ref={chipRef(m.memberId)}
						className={`recipient-chip${selected ? ' selected' : ''}`}
						title={label}
						aria-label={label}
						aria-checked={selected}
						tabIndex={tabStopValue === m.memberId ? 0 : -1}
						data-testid={`recipient-chip-${m.memberId}`}
						onClick={() => onRecipientChange(m.memberId)}
						onKeyDown={(e) => handleChipKeyDown(e, m.memberId)}
					>
						<Avatar name={label} size={22} imageBase64={m.avatar} />
					</button>
				);
			})}

			{members.length === 0 && <p className="caption recipient-empty">No one else online</p>}
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
