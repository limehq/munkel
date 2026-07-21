import { dialog, ipcMain } from 'electron';
import type { AppState } from './session-store';
import type { GitHubLoginService } from './github-login';
import type { PresenceMonitor } from './presence-monitor';
import { IPC_CHANNELS } from '../shared/ipc-channels';

export function registerSessionHandlers(appState: AppState, githubLoginService: GitHubLoginService, presenceMonitor: PresenceMonitor): void {
	ipcMain.handle(IPC_CHANNELS.JOIN_CIRCLE, async (_event, code: string, relayUrl?: string) => {
		await appState.joinCircle(code, relayUrl);
	});

	ipcMain.handle(IPC_CHANNELS.LEAVE_CIRCLE, async (_event, code: string) => {
		appState.leaveCircle(code);
	});

	ipcMain.handle(IPC_CHANNELS.SEND_CHAT, async (_event, code: string, text: string, to?: string) => {
		return appState.sendChat(code, text, to);
	});

	ipcMain.handle(IPC_CHANNELS.SEND_IMAGES, async (_event, code: string, paths: string[], caption: string, to?: string) => {
		return appState.sendImages(code, paths, caption, to);
	});

	ipcMain.handle(IPC_CHANNELS.UPDATE_PROFILE, async (_event, displayName: string, avatar?: string) => {
		appState.updateIdentity(avatar === undefined ? { displayName } : { displayName, avatar });
	});

	ipcMain.handle(IPC_CHANNELS.SET_PRESENCE_STATUS, async (_event, status: 'online' | 'dnd' | 'away') => {
		presenceMonitor.chooseStatus(status);
	});

	ipcMain.handle(IPC_CHANNELS.SET_RELAY_URL, async (_event, code: string, relayUrl: string) => {
		await appState.setRelayUrl(code, relayUrl);
	});

	ipcMain.handle(IPC_CHANNELS.GET_STATE, async () => {
		return appState.getState();
	});

	ipcMain.handle(IPC_CHANNELS.SELECT_IMAGES, async () => {
		const result = await dialog.showOpenDialog({
			properties: ['openFile', 'multiSelections'],
			filters: [
				{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] },
				{ name: 'All files', extensions: ['*'] },
			],
		});
		return result.canceled ? undefined : result.filePaths;
	});

	ipcMain.handle(IPC_CHANNELS.GITHUB_LOGOUT, async () => {
		githubLoginService.logoutGitHub();
	});
}
