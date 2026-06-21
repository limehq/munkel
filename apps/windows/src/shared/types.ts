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
}

export interface StateUpdate {
	identity: IdentityState;
	circles: CircleState[];
}

export interface IncomingImage {
	id: string;       // = r2Key
	thumb: string;    // base64 AVIF
	width: number;
	height: number;
}

export interface NotchMessage {
	sender: string;
	text: string;
	isDirect: boolean;
	group: string;
	groupColor: string;
	images?: IncomingImage[];
}

export interface IpcApi {
	getWindowType: () => Promise<WindowType>;
	hideWindow: () => Promise<void>;
	showPalette: () => Promise<void>;
	toggleMenu: () => Promise<void>;
	quitApp: () => Promise<void>;
	onGlobalShortcut: (callback: () => void) => () => void;

	// Circle / session management.
	joinCircle: (code: string, relayUrl?: string) => Promise<void>;
	leaveCircle: (code: string) => Promise<void>;
	sendChat: (code: string, text: string, to?: string) => Promise<{ ok: boolean; error?: string }>;
	updateProfile: (displayName: string, avatar?: string) => Promise<void>;
	setRelayUrl: (code: string, relayUrl: string) => Promise<void>;
	getState: () => Promise<StateUpdate>;

	// Crypto (main-process only; raw keys never cross the bridge).
	deriveGroupId: (code: string) => Promise<string>;
	sealChat: (code: string, text: string, sentAt?: string) => Promise<string>;
	openChat: (code: string, payload: string) => Promise<{ kind: 'chat'; text: string; sentAt: string } | null>;

	// Notch demo.
	testNotch: () => Promise<void>;

	// Main → renderer push channels.
	onStateUpdate: (callback: (update: StateUpdate) => void) => () => void;
	onNotchMessage: (callback: (message: NotchMessage) => void) => () => void;
	onRelayError: (callback: (message: string) => void) => () => void;
	onNotchShow: (callback: () => void) => () => void;
	onNotchHide: (callback: () => void) => () => void;
	onNotchUpdate: (callback: (data: NotchMessage) => void) => () => void;
}

declare global {
	interface Window {
		electronAPI: IpcApi;
	}
}
