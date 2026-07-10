import { clipboard, dialog, ipcMain, type WebContents } from 'electron';
import { readdir, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppState } from './session-store';
import type { GitHubLoginService } from './github-login';
import {
	addOwnedClipboardTempPath,
	cleanupClipboardTempPaths,
	saveClipboardImageToTemp,
	sweepClipboardTempFiles,
} from './clipboard-image-save';
import { IPC_CHANNELS } from '../shared/ipc-channels';

export interface SessionHandlerOptions {
	/**
	 * Sender guard for the `save-clipboard-image` AND `send-images` channels
	 * (Plan 12 P3.4 hardening): only windows that actually have an
	 * image-compose UI — the palette and the menu — may pull images off the
	 * user's clipboard or trigger the file-reading image-send pipeline.
	 * `main.ts` supplies the window comparison (same posture as the
	 * `notch-*` / launch-at-login guards, which also live in the untested
	 * main.ts wiring). Fail-closed: without a predicate every sender is
	 * rejected.
	 */
	isImagePasteSender: (sender: WebContents) => boolean;
}

export function registerSessionHandlers(
	appState: AppState,
	githubLoginService: GitHubLoginService,
	options: SessionHandlerOptions,
): void {
	// Paths of clipboard temp files THIS instance created via the
	// save-clipboard-image handler below. This set is the sole deletion
	// authority for the post-send cleanup — a renderer-supplied path is
	// never deleted unless it is literally one we handed out earlier (see
	// cleanupClipboardTempPaths' doc for the full rationale).
	const ownedClipboardTempPaths = new Set<string>();

	// Safety-net sweep of clipboard temp PNGs left over from previous
	// sessions (crash, quit-before-send, attachment removed by hand). Only
	// deletes files older than SWEEP_MIN_AGE_MS. See clipboard-image-save.ts
	// for the full temp-file lifecycle.
	void sweepClipboardTempFiles({ tmpdir: () => os.tmpdir(), join: path.join, readdir, stat, unlink });

	ipcMain.handle(IPC_CHANNELS.JOIN_CIRCLE, async (_event, code: string, relayUrl?: string) => {
		await appState.joinCircle(code, relayUrl);
	});

	ipcMain.handle(IPC_CHANNELS.LEAVE_CIRCLE, async (_event, code: string) => {
		appState.leaveCircle(code);
	});

	ipcMain.handle(IPC_CHANNELS.SEND_CHAT, async (_event, code: string, text: string, to?: string) => {
		return appState.sendChat(code, text, to);
	});

	ipcMain.handle(IPC_CHANNELS.SEND_IMAGES, async (event, code: string, paths: string[], caption: string, to?: string) => {
		// Same sender guard as save-clipboard-image: send-images reads
		// arbitrary renderer-supplied file paths off disk, so only the two
		// windows with an image-compose UI may invoke it.
		if (!options.isImagePasteSender(event.sender)) {
			console.warn('[munkel] rejected send-images from unauthorized sender');
			return { ok: false, error: 'Not allowed from this window' };
		}
		const result = await appState.sendImages(code, paths, caption, to);
		// A clipboard temp file's lifecycle ends with the successful send (the
		// renderer clears its attachment list on `ok`). Only paths in the
		// owned set — files this instance itself wrote — are ever deleted.
		// On failure the files are kept: the renderer keeps the attachments
		// for retry, and the startup sweep is the backstop.
		if (result.ok) {
			await cleanupClipboardTempPaths(paths, ownedClipboardTempPaths, {
				unlink,
				tmpdir: () => os.tmpdir(),
				resolve: path.resolve,
				sep: path.sep,
			});
		}
		return result;
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
	// imageCodec size/type limits. Validation (decoded-pixel cap before the
	// PNG encode/write) and the temp-file lifecycle live in the testable
	// `clipboard-image-save.ts`; only the Electron wiring is here.
	ipcMain.handle(IPC_CHANNELS.SAVE_CLIPBOARD_IMAGE, async (event) => {
		if (!options.isImagePasteSender(event.sender)) {
			console.warn('[munkel] rejected save-clipboard-image from unauthorized sender');
			return null;
		}
		const tempPath = await saveClipboardImageToTemp(clipboard.readImage(), {
			tmpdir: () => os.tmpdir(),
			join: path.join,
			writeFile,
		});
		// Register the path as owned by this instance — the ONLY way a path
		// becomes eligible for the post-send cleanup deletion above. Bounded
		// FIFO cap (see addOwnedClipboardTempPath) so repeated
		// paste-without-send over a long-running session can't grow this set
		// unbounded.
		if (tempPath) addOwnedClipboardTempPath(ownedClipboardTempPaths, tempPath);
		return tempPath;
	});

	ipcMain.handle(IPC_CHANNELS.GITHUB_LOGOUT, async () => {
		githubLoginService.logoutGitHub();
	});
}
