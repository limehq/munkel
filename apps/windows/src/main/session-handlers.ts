import { clipboard, dialog, ipcMain } from 'electron';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppState } from './session-store';
import type { GitHubLoginService } from './github-login';
import { IPC_CHANNELS } from '../shared/ipc-channels';

export function registerSessionHandlers(appState: AppState, githubLoginService: GitHubLoginService): void {
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

	// Clipboard image paste (Plan 12 P3.4). Reads the OS clipboard's image via
	// Electron's native `clipboard` module (no permission prompt — unlike
	// `navigator.clipboard.read()`, which is unreliable in these small
	// focus-light BrowserWindows) and saves it to a temp PNG file, returning
	// its path. The renderer pushes that path into the same `imagePaths`
	// array `selectImages` already fills, so the pasted image flows through
	// the *existing* `sendImages(paths)` pipeline — including its
	// imageCodec size/type limits — instead of a separate raw-bytes path.
	ipcMain.handle(IPC_CHANNELS.SAVE_CLIPBOARD_IMAGE, async () => {
		const image = clipboard.readImage();
		if (image.isEmpty()) return null;
		const tempPath = path.join(os.tmpdir(), `munkel-clipboard-${Date.now()}-${randomBytes(4).toString('hex')}.png`);
		try {
			await writeFile(tempPath, image.toPNG());
		} catch (err) {
			console.error('[munkel] failed to save clipboard image to temp file:', err);
			return null;
		}
		return tempPath;
	});

	ipcMain.handle(IPC_CHANNELS.GITHUB_LOGOUT, async () => {
		githubLoginService.logoutGitHub();
	});
}
