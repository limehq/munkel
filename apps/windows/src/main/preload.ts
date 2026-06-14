import { contextBridge, ipcRenderer } from 'electron';
import type { IpcApi, NotchMessage } from '../shared/types';

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

	deriveGroupId: (code) => ipcRenderer.invoke('derive-group-id', code),
	sealChat: (code, text, sentAt) => ipcRenderer.invoke('seal-chat', code, text, sentAt),
	openChat: (code, payload) => ipcRenderer.invoke('open-chat', code, payload),

	testNotch: () => ipcRenderer.invoke('test-notch'),

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
