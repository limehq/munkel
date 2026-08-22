import type { PresenceStatus } from '@munkel/shared-wire/payload';

export type { PresenceStatus };

export type WindowType = 'menu' | 'notch' | 'palette';

export interface Member {
	memberId: string;
	displayName?: string;
	avatar?: string;
	avatarURL?: string;
	joinedAt: string;
	status?: PresenceStatus;
}

export interface CircleState {
	code: string;
	groupId: string;
	isConnected: boolean;
	members: Member[];
	relayUrl: string;
}

export interface IdentityState {
	memberId: string;
	displayName: string;
	avatar?: string;
	githubLogin?: string;
	/** The presence status chosen by the user (local status). */
	presenceStatus: PresenceStatus;
	/** The effective status, including auto-away derivation. */
	effectiveStatus: PresenceStatus;
}

export interface StateUpdate {
	identity: IdentityState;
	circles: CircleState[];
}

export type GitHubLoginPhase = 'idle' | 'requesting' | 'awaiting' | 'fetching' | 'failed';

export interface GitHubLoginState {
	phase: GitHubLoginPhase;
	userCode?: string;
	error?: string;
}

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'confirm' | 'error';

export interface UpdateState {
	phase: UpdatePhase;
	/** Available or downloaded update version, when known. */
	version?: string;
	/** Download progress percent (0–100) during the downloading phase. */
	progress?: number;
	/** User-facing error message in the error phase. */
	error?: string;
}

export interface IncomingImage {
	id: string;       // = r2Key
	thumb: string;    // base64 AVIF
	width: number;
	height: number;
	mime?: string;    // original MIME type (e.g. image/gif for animation parity)
}

export interface NotchMessage {
	sender: string;
	/** Relay member UUID (`frame.from`); required for private notch replies. */
	senderMemberId?: string;
	text: string;
	isDirect: boolean;
	group: string;
	groupColor: string;
	/** Local receiver timestamp (ISO-8601) used for notch history expiry. */
	receivedAt: string;
	images?: IncomingImage[];
	/** When true, the incoming message is added to history but the preview is not shown. */
	silent?: boolean;
	/** When true, the message was sent by this user (e.g. a successful reply).
	 * Own messages appear in history but never drive the single-message view
	 * or phase lifecycle, so the outgoing confirmation chip stays visible. */
	isOwn?: boolean;
}

export interface IpcApi {
	getWindowType: () => Promise<WindowType>;
	hideWindow: () => Promise<void>;
	showPalette: () => Promise<void>;
	toggleMenu: () => Promise<void>;
	setMenuPickerOpen: (open: boolean) => Promise<void>;
	quitApp: () => Promise<void>;
	onGlobalShortcut: (callback: () => void) => () => void;

	// Circle / session management.
	joinCircle: (code: string, relayUrl?: string) => Promise<void>;
	leaveCircle: (code: string) => Promise<void>;
	sendChat: (code: string, text: string, to?: string) => Promise<{ ok: boolean; error?: string }>;
	sendImages: (code: string, paths: string[], caption: string, to?: string) => Promise<{ ok: boolean; error?: string }>;
	updateProfile: (displayName: string, avatar?: string) => Promise<void>;
	setPresenceStatus: (status: PresenceStatus) => Promise<void>;
	setRelayUrl: (code: string, relayUrl: string) => Promise<void>;
	getState: () => Promise<StateUpdate>;
	startGitHubLogin: () => Promise<void>;
	cancelGitHubLogin: () => Promise<void>;
	githubLogout: () => Promise<void>;

	// Image picker (main-process dialog; returns file paths).
	selectImages: () => Promise<string[] | undefined>;
	// Clipboard image paste (Plan 12 P3.4). Reads the OS clipboard's image
	// (if any) via Electron's native `clipboard` module in the main process
	// and saves it to a temp file, returning its path — the same shape as
	// `selectImages`' entries, so a pasted image flows through the existing
	// `sendImages(paths)` pipeline (and its imageCodec size/type limits)
	// instead of a separate raw-bytes path. Resolves `null` when the
	// clipboard has no image or the temp-file write failed.
	saveClipboardImage: () => Promise<string | null>;

	beginNotchReply: () => Promise<void>;
	endNotchReply: () => Promise<void>;
	notchSetInteractive: (interactive: boolean) => Promise<void>;
	notchEmpty: () => Promise<void>;
	notchResize: (contentHeight: number) => Promise<void>;
	// Hover-"C" copy (Plan 12 P3.2). The notch window is non-focusable outside
	// of an active reply, so a bare "C" keypress can only be caught via an
	// OS-level global shortcut in the main process (`main/hover-copy-shortcut.ts`).
	// The renderer is only a hint provider: `true` arms the shortcut (and,
	// while armed, acts as a mousemove activity ping that resets the main
	// process's idle-disarm timer), `false` requests disarm. The main process
	// additionally force-disarms on window hide, click-through transition,
	// renderer crash, and idle timeout. Resolves `false` when arming failed
	// (OS registration rejected) so the renderer can disable the feature.
	notchSetHoverCopyActive: (active: boolean) => Promise<boolean>;

	// Image Quick-Look overlay (Plan 14, macOS-parity hover preview). The
	// main process owns the R2 download + decrypt (the renderer never sees
	// `messageKey`); `data` is the decrypted full-res bytes, base64-encoded
	// for IPC transit. `notchSetPreviewActive` widens/restores the notch
	// window (main/notch-window.ts) so the overlay can paint outside the
	// compact 280px canvas — sender-guarded to the notch window only.
	notchLoadFullImage: (group: string, r2Key: string) => Promise<{ ok: true; data: string } | { ok: false }>;
	notchSetPreviewActive: (active: boolean) => Promise<void>;

	fetchFullImage: (
		code: string,
		r2Key: string,
	) => Promise<
		| { ok: true; data: string; mime: string }
		| { ok: false; error: string }
	>;

	checkForUpdates: () => Promise<{ ok: boolean }>;
	installUpdate: () => Promise<{ ok: boolean }>;
	confirmInstallUpdate: () => Promise<{ ok: boolean }>;
	cancelInstallUpdate: () => Promise<{ ok: boolean }>;

	// Opt-in autostart (Plan 12 P2.1). Windows never auto-registers; this
	// only ever mirrors the user's explicit toggle choice.
	getLaunchAtLogin: () => Promise<boolean>;
	setLaunchAtLogin: (enabled: boolean) => Promise<boolean>;

	// Auto-update "Check Automatically" toggle (Plan 12 P3.7). Controls
	// whether `UpdateServiceImpl` performs the launch check and periodic
	// 24h checks; manual "Check for Updates…" always works regardless.
	getAutoUpdateCheck: () => Promise<boolean>;
	setAutoUpdateCheck: (enabled: boolean) => Promise<boolean>;

	// Rebindable global palette-toggle hotkey (Plan 12 P3.1). Both calls
	// report only the accelerator whose OS registration is CONFIRMED —
	// `null` means the hotkey is currently unbound (startup registration
	// failed, or a rebind's rollback also failed; see palette-hotkey.ts's
	// confirmed-binding invariant). `setPaletteHotkey` resolves the requested
	// accelerator on success; on failure it resolves whatever is really bound
	// now (the rolled-back previous combo, the healed default, or `null`),
	// so the settings-popover recorder displays reality, never intent. A
	// later successful set fully heals an unbound state — no restart needed.
	getPaletteHotkey: () => Promise<string | null>;
	setPaletteHotkey: (
		accelerator: string,
	) => Promise<{ ok: boolean; accelerator: string | null; error?: string }>;

	// Dev-only flag (Plan 13 items 5–6). Backed by `!app.isPackaged` in main.ts
	// (deliberately NOT an env var like NODE_ENV, which a launcher/shortcut
	// could spoof to unlock these in a shipped release). The settings-popover
	// dev toggles below are only rendered when this resolves `true`; a packaged
	// build's main process also refuses their SET/GET IPC calls regardless of
	// what the renderer sends, so this is UI-gating on top of an
	// already-enforced main-process gate, not the only line of defense.
	isDev: () => Promise<boolean>;

	// Dev-only "Allow in screenshots" toggle (Plan 13 item 5), mirroring
	// macOS `CaptureScreenshotPreference` (`CaptureExclusion.swift`). Default
	// `false` — every window stays excluded from screen capture
	// (`setContentProtection(true)`) until a developer opts in. Windows has
	// no `.readOnly` equivalent, so enabling this makes the surfaces visible
	// in screenshots AND live recordings (the same DEBUG trade-off macOS
	// documents).
	getAllowInScreenshots: () => Promise<boolean>;
	setAllowInScreenshots: (enabled: boolean) => Promise<boolean>;

	// Dev-only "Echo my broadcasts" toggle (Plan 13 item 6). Opt-in (default
	// `false`); when enabled, a successful broadcast send is also dispatched
	// locally through the same `onNotch` path used for real incoming messages
	// (the relay only delivers broadcasts to *other* members).
	getDevEchoBroadcasts: () => Promise<boolean>;
	setDevEchoBroadcasts: (enabled: boolean) => Promise<boolean>;

	// Main → renderer push channels.
	onStateUpdate: (callback: (update: StateUpdate) => void) => () => void;
	onGitHubLoginState: (callback: (state: GitHubLoginState) => void) => () => void;
	onUpdateState: (callback: (state: UpdateState) => void) => () => void;
	onNotchMessage: (callback: (message: NotchMessage) => void) => () => void;
	onRelayError: (callback: (message: string) => void) => () => void;
	onNotchShow: (callback: () => void) => () => void;
	onNotchHide: (callback: () => void) => () => void;
	onNotchUpdate: (callback: (data: NotchMessage) => void) => () => void;
	// Reserved fallback for cursor-polling reopen; do not remove as dead code.
	onNotchReopen: (callback: () => void) => () => void;
	// Fired by the main process when the hover-"C" global shortcut triggers
	// while the notch is hovered (Plan 12 P3.2).
	onNotchCopyHovered: (callback: () => void) => () => void;
}

declare global {
	interface Window {
		electronAPI: IpcApi;
	}
}
