import { dialog, ipcMain } from 'electron';
import type { AppState } from './session-store';
import type { GitHubLoginService } from './github-login';

export function registerSessionHandlers(appState: AppState, githubLoginService: GitHubLoginService): void {
	ipcMain.handle('join-circle', async (_event, code: string, relayUrl?: string) => {
		await appState.joinCircle(code, relayUrl);
	});

	ipcMain.handle('leave-circle', async (_event, code: string) => {
		appState.leaveCircle(code);
	});

	ipcMain.handle('send-chat', async (_event, code: string, text: string, to?: string) => {
		return appState.sendChat(code, text, to);
	});

	ipcMain.handle('send-images', async (_event, code: string, paths: string[], caption: string, to?: string) => {
		return appState.sendImages(code, paths, caption, to);
	});

	ipcMain.handle('update-profile', async (_event, displayName: string, avatar?: string) => {
		appState.updateIdentity(avatar === undefined ? { displayName } : { displayName, avatar });
	});

	ipcMain.handle('set-relay-url', async (_event, code: string, relayUrl: string) => {
		await appState.setRelayUrl(code, relayUrl);
	});

	ipcMain.handle('get-state', async () => {
		return appState.getState();
	});

	ipcMain.handle('select-images', async () => {
		const result = await dialog.showOpenDialog({
			properties: ['openFile', 'multiSelections'],
			filters: [
				{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp'] },
				{ name: 'All files', extensions: ['*'] },
			],
		});
		return result.canceled ? undefined : result.filePaths;
	});

	ipcMain.handle('github-logout', async () => {
		githubLoginService.logoutGitHub();
	});
}
