export type WindowType = 'menu' | 'notch' | 'palette';

export interface Member {
	memberId: string;
	displayName?: string;
	avatar?: string;
	joinedAt: string;
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

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

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
	setRelayUrl: (code: string, relayUrl: string) => Promise<void>;
	getState: () => Promise<StateUpdate>;
	startGitHubLogin: () => Promise<void>;
	cancelGitHubLogin: () => Promise<void>;
	githubLogout: () => Promise<void>;

	// Image picker (main-process dialog; returns file paths).
	selectImages: () => Promise<string[] | undefined>;

	beginNotchReply: () => Promise<void>;
	endNotchReply: () => Promise<void>;
	notchSetInteractive: (interactive: boolean) => Promise<void>;
	notchEmpty: () => Promise<void>;
	notchResize: (contentHeight: number) => Promise<void>;
	// Hover-"C" copy (Plan 12 P3.2). The notch window is non-focusable outside
	// of an active reply, so a bare "C" keypress can only be caught via an
	// OS-level global shortcut in the main process (see `main/shortcuts.ts`).
	// The renderer arms/disarms that shortcut based on its own hover + reply
	// state, and receives `onNotchCopyHovered` when it fires.
	notchSetHoverCopyActive: (active: boolean) => Promise<void>;

	checkForUpdates: () => Promise<void>;
	installUpdate: () => Promise<void>;

	// Opt-in autostart (Plan 12 P2.1). Windows never auto-registers; this
	// only ever mirrors the user's explicit toggle choice.
	getLaunchAtLogin: () => Promise<boolean>;
	setLaunchAtLogin: (enabled: boolean) => Promise<boolean>;

	// Auto-update "Check Automatically" toggle (Plan 12 P3.7). Controls
	// whether `UpdateServiceImpl` performs the launch check and periodic
	// 24h checks; manual "Check for Updates…" always works regardless.
	getAutoUpdateCheck: () => Promise<boolean>;
	setAutoUpdateCheck: (enabled: boolean) => Promise<boolean>;

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
