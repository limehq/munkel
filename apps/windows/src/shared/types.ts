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
	/** When true, the incoming message is added to history but the preview is not shown. */
	silent?: boolean;
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

	beginNotchReply: () => Promise<void>;
	endNotchReply: () => Promise<void>;
	notchSetInteractive: (interactive: boolean) => Promise<void>;
	notchEmpty: () => Promise<void>;

	checkForUpdates: () => Promise<{ ok: boolean }>;
	installUpdate: () => Promise<{ ok: boolean }>;

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
}

declare global {
	interface Window {
		electronAPI: IpcApi;
	}
}
