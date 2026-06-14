export type WindowType = 'menu' | 'notch' | 'palette';

export interface IpcApi {
	getWindowType: () => Promise<WindowType>;
	hideWindow: () => Promise<void>;
	showPalette: () => Promise<void>;
	toggleMenu: () => Promise<void>;
	quitApp: () => Promise<void>;
	onGlobalShortcut: (callback: () => void) => () => void;

	// Crypto (main-process only; raw keys never cross the bridge).
	deriveGroupId: (code: string) => Promise<string>;
	sealChat: (code: string, text: string, sentAt?: string) => Promise<string>;
	openChat: (code: string, payload: string) => Promise<{ kind: 'chat'; text: string; sentAt: string } | null>;

	// Notch demo.
	testNotch: () => Promise<void>;

	// Main → renderer push channels.
	onNotchShow: (callback: () => void) => () => void;
	onNotchHide: (callback: () => void) => () => void;
	onNotchUpdate: (callback: (data: NotchMessage) => void) => () => void;
}

export interface NotchMessage {
	sender: string;
	text: string;
	isDirect: boolean;
	group: string;
	groupColor: string;
}

declare global {
	interface Window {
		electronAPI: IpcApi;
	}
}
