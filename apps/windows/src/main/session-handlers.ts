import { ipcMain } from 'electron';
import type { AppState } from './session-store';

export function registerSessionHandlers(appState: AppState): void {
	ipcMain.handle('join-circle', async (_event, code: string, relayUrl?: string) => {
		await appState.joinCircle(code, relayUrl);
	});

	ipcMain.handle('leave-circle', async (_event, code: string) => {
		appState.leaveCircle(code);
	});

	ipcMain.handle('send-chat', async (_event, code: string, text: string, to?: string) => {
		return appState.sendChat(code, text, to);
	});

	ipcMain.handle('update-profile', async (_event, displayName: string, avatar?: string) => {
		appState.updateIdentity(displayName, avatar);
	});

	ipcMain.handle('set-relay-url', async (_event, code: string, relayUrl: string) => {
		await appState.setRelayUrl(code, relayUrl);
	});

	ipcMain.handle('get-state', async () => {
		return appState.getState();
	});
}
