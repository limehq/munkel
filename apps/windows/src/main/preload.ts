import { contextBridge, ipcRenderer } from 'electron';
import type { GitHubLoginState, IpcApi, NotchMessage, StateUpdate, UpdateState } from '../shared/types';
import { IPC_CHANNELS, PUSH_CHANNELS } from '../shared/ipc-channels';

const api: IpcApi = {
	getWindowType: () => ipcRenderer.invoke(IPC_CHANNELS.GET_WINDOW_TYPE),
	hideWindow: () => ipcRenderer.invoke(IPC_CHANNELS.HIDE_WINDOW),
	showPalette: () => ipcRenderer.invoke(IPC_CHANNELS.SHOW_PALETTE),
	toggleMenu: () => ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_MENU),
	setMenuPickerOpen: (open) => ipcRenderer.invoke(IPC_CHANNELS.MENU_PICKER_STATE, open),
	quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.QUIT_APP),
	onGlobalShortcut: (callback) => {
		const handler = () => callback();
		ipcRenderer.on(PUSH_CHANNELS.GLOBAL_SHORTCUT, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.GLOBAL_SHORTCUT, handler);
	},

	joinCircle: (code, relayUrl) => ipcRenderer.invoke(IPC_CHANNELS.JOIN_CIRCLE, code, relayUrl),
	leaveCircle: (code) => ipcRenderer.invoke(IPC_CHANNELS.LEAVE_CIRCLE, code),
	sendChat: (code, text, to) => ipcRenderer.invoke(IPC_CHANNELS.SEND_CHAT, code, text, to),
	sendImages: (code, paths, caption, to) => ipcRenderer.invoke(IPC_CHANNELS.SEND_IMAGES, code, paths, caption, to),
	updateProfile: (displayName, avatar) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_PROFILE, displayName, avatar),
	setRelayUrl: (code, relayUrl) => ipcRenderer.invoke(IPC_CHANNELS.SET_RELAY_URL, code, relayUrl),
	getState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STATE),
	startGitHubLogin: () => ipcRenderer.invoke(IPC_CHANNELS.START_GITHUB_LOGIN),
	cancelGitHubLogin: () => ipcRenderer.invoke(IPC_CHANNELS.CANCEL_GITHUB_LOGIN),
	githubLogout: () => ipcRenderer.invoke(IPC_CHANNELS.GITHUB_LOGOUT),

	selectImages: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_IMAGES),
	saveClipboardImage: () => ipcRenderer.invoke(IPC_CHANNELS.SAVE_CLIPBOARD_IMAGE),

	checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.CHECK_FOR_UPDATES),
	installUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.INSTALL_UPDATE),

	getLaunchAtLogin: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LAUNCH_AT_LOGIN),
	setLaunchAtLogin: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.SET_LAUNCH_AT_LOGIN, enabled),

	beginNotchReply: () => ipcRenderer.invoke(IPC_CHANNELS.NOTCH_BEGIN_REPLY),
	endNotchReply: () => ipcRenderer.invoke(IPC_CHANNELS.NOTCH_END_REPLY),
	notchSetInteractive: (interactive) => ipcRenderer.invoke(IPC_CHANNELS.NOTCH_SET_INTERACTIVE, interactive),
	notchEmpty: () => ipcRenderer.invoke(IPC_CHANNELS.NOTCH_EMPTY),
	notchResize: (contentHeight) => ipcRenderer.invoke(IPC_CHANNELS.NOTCH_RESIZE, contentHeight),
	notchSetHoverCopyActive: (active) => ipcRenderer.invoke(IPC_CHANNELS.NOTCH_SET_HOVER_COPY, active),

	getAutoUpdateCheck: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AUTO_UPDATE_CHECK),
	setAutoUpdateCheck: (enabled) => ipcRenderer.invoke(IPC_CHANNELS.SET_AUTO_UPDATE_CHECK, enabled),

	onStateUpdate: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: StateUpdate) => callback(data);
		ipcRenderer.on(PUSH_CHANNELS.STATE_UPDATE, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.STATE_UPDATE, handler);
	},
	onGitHubLoginState: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: GitHubLoginState) => callback(data);
		ipcRenderer.on(PUSH_CHANNELS.GITHUB_LOGIN_STATE, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.GITHUB_LOGIN_STATE, handler);
	},
	onUpdateState: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: UpdateState) => callback(data);
		ipcRenderer.on(PUSH_CHANNELS.UPDATE_STATE, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.UPDATE_STATE, handler);
	},
	onNotchMessage: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: NotchMessage) => callback(data);
		ipcRenderer.on(PUSH_CHANNELS.NOTCH_MESSAGE, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.NOTCH_MESSAGE, handler);
	},
	onRelayError: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
		ipcRenderer.on(PUSH_CHANNELS.RELAY_ERROR, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.RELAY_ERROR, handler);
	},
	onNotchShow: (callback) => {
		const handler = () => callback();
		ipcRenderer.on(PUSH_CHANNELS.NOTCH_SHOW, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.NOTCH_SHOW, handler);
	},
	onNotchHide: (callback) => {
		const handler = () => callback();
		ipcRenderer.on(PUSH_CHANNELS.NOTCH_HIDE, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.NOTCH_HIDE, handler);
	},
	onNotchUpdate: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: NotchMessage) => callback(data);
		ipcRenderer.on(PUSH_CHANNELS.NOTCH_UPDATE, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.NOTCH_UPDATE, handler);
	},
	// Reserved fallback for cursor-polling reopen; do not remove as dead code.
	onNotchReopen: (callback) => {
		const handler = () => callback();
		ipcRenderer.on(PUSH_CHANNELS.NOTCH_REOPEN, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.NOTCH_REOPEN, handler);
	},
	onNotchCopyHovered: (callback) => {
		const handler = () => callback();
		ipcRenderer.on(PUSH_CHANNELS.NOTCH_COPY_HOVERED, handler);
		return () => ipcRenderer.removeListener(PUSH_CHANNELS.NOTCH_COPY_HOVERED, handler);
	},
};

contextBridge.exposeInMainWorld('electronAPI', api);
