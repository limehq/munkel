import { contextBridge, ipcRenderer } from 'electron';
import type { IpcApi, NotchMessage, StateUpdate } from '../shared/types';

const api: IpcApi = {
	getWindowType: () => ipcRenderer.invoke('get-window-type'),
	hideWindow: () => ipcRenderer.invoke('hide-window'),
	showPalette: () => ipcRenderer.invoke('show-palette'),
	toggleMenu: () => ipcRenderer.invoke('toggle-menu'),
	quitApp: () => ipcRenderer.invoke('quit-app'),
	onGlobalShortcut: (callback) => {
		const handler = () => callback();
		ipcRenderer.on('global-shortcut', handler);
		return () => ipcRenderer.removeListener('global-shortcut', handler);
	},

	joinCircle: (code, relayUrl) => ipcRenderer.invoke('join-circle', code, relayUrl),
	leaveCircle: (code) => ipcRenderer.invoke('leave-circle', code),
	sendChat: (code, text, to) => ipcRenderer.invoke('send-chat', code, text, to),
	sendImages: (code, paths, caption, to) => ipcRenderer.invoke('send-images', code, paths, caption, to),
	updateProfile: (displayName, avatar) => ipcRenderer.invoke('update-profile', displayName, avatar),
	setRelayUrl: (code, relayUrl) => ipcRenderer.invoke('set-relay-url', code, relayUrl),
	getState: () => ipcRenderer.invoke('get-state'),

	selectImages: () => ipcRenderer.invoke('select-images'),

	deriveGroupId: (code) => ipcRenderer.invoke('derive-group-id', code),
	sealChat: (code, text, sentAt) => ipcRenderer.invoke('seal-chat', code, text, sentAt),
	openChat: (code, payload) => ipcRenderer.invoke('open-chat', code, payload),

	testNotch: () => ipcRenderer.invoke('test-notch'),

	onStateUpdate: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: StateUpdate) => callback(data);
		ipcRenderer.on('state-update', handler);
		return () => ipcRenderer.removeListener('state-update', handler);
	},
	onNotchMessage: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: NotchMessage) => callback(data);
		ipcRenderer.on('notch-message', handler);
		return () => ipcRenderer.removeListener('notch-message', handler);
	},
	onRelayError: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
		ipcRenderer.on('relay-error', handler);
		return () => ipcRenderer.removeListener('relay-error', handler);
	},
	onNotchShow: (callback) => {
		const handler = () => callback();
		ipcRenderer.on('notch-show', handler);
		return () => ipcRenderer.removeListener('notch-show', handler);
	},
	onNotchHide: (callback) => {
		const handler = () => callback();
		ipcRenderer.on('notch-hide', handler);
		return () => ipcRenderer.removeListener('notch-hide', handler);
	},
	onNotchUpdate: (callback) => {
		const handler = (_event: Electron.IpcRendererEvent, data: NotchMessage) => callback(data);
		ipcRenderer.on('notch-update', handler);
		return () => ipcRenderer.removeListener('notch-update', handler);
	},
};

contextBridge.exposeInMainWorld('electronAPI', api);
