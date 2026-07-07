import { autoUpdater as defaultAutoUpdater, type AppUpdater } from 'electron-updater';
import type { UpdatePhase, UpdateState } from '../shared/types';

export type { UpdatePhase, UpdateState } from '../shared/types';

export type UpdateSend = (state: UpdateState) => void;

export interface UpdateService {
	check: () => { ok: boolean };
	install: () => { ok: boolean };
	confirmInstall: () => { ok: boolean };
	cancelInstall: () => { ok: boolean };
	dispose: () => void;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isSignatureError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const message = String((error as Error).message ?? '').toLowerCase();
	return message.includes('signature') || message.includes('codesign');
}

function userMessageForError(error: unknown): string {
	if (isSignatureError(error)) {
		return 'Update failed: the downloaded installer is not signed. Unsigned beta builds require signature verification to be disabled.';
	}
	const message = String((error as Error | undefined)?.message ?? '').toLowerCase();
	if (
		message.includes('net::') ||
		message.includes('network') ||
		message.includes('econnrefused') ||
		message.includes('econnreset') ||
		message.includes('etimedout') ||
		message.includes('enotfound') ||
		message.includes('getaddrinfo')
	) {
		return 'Update check failed: network error.';
	}
	if (message.includes('certificate') || message.includes('tls') || message.includes('ssl')) {
		return 'Update check failed: secure connection error.';
	}
	return 'Update check failed.';
}

class UpdateServiceImpl implements UpdateService {
	private phase: UpdatePhase = 'idle';
	private error?: string;
	private downloadedVersion?: string;
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private checking = false;
	private installing = false;
	private readonly send: UpdateSend;
	private readonly autoUpdater: AppUpdater;
	private readonly isDev: boolean;

	constructor(send: UpdateSend, autoUpdater: AppUpdater, isDev: boolean) {
		this.send = send;
		this.autoUpdater = autoUpdater;
		this.isDev = isDev;

		this.autoUpdater.logger = null;
		this.autoUpdater.autoDownload = true;
		this.autoUpdater.autoInstallOnAppQuit = false;

		this.autoUpdater.on('checking-for-update', () => {
			this.setPhase('checking');
		});

		this.autoUpdater.on('update-available', (info) => {
			this.setPhase('available', { version: info.version });
		});

		this.autoUpdater.on('update-not-available', () => {
			this.setPhase('idle');
		});

		this.autoUpdater.on('download-progress', (progress) => {
			this.setPhase('downloading', { progress: progress.percent });
		});

		this.autoUpdater.on('update-downloaded', (info) => {
			this.downloadedVersion = info.version;
			this.setPhase('downloaded', { version: info.version });
		});

		this.autoUpdater.on('error', (error) => {
			console.error('[update-service] autoUpdater error:', error);
			this.setPhase('error', { error: userMessageForError(error) });
		});
	}

	check(): { ok: boolean } {
		if (this.isDev || this.checking) return { ok: false };
		if (
			this.phase === 'available' ||
			this.phase === 'downloading' ||
			this.phase === 'downloaded' ||
			this.phase === 'confirm'
		) {
			return { ok: false };
		}
		this.checking = true;
		this.autoUpdater
			.checkForUpdates()
			.catch((error: unknown) => {
				console.error('[update-service] checkForUpdates rejected:', error);
				// Errors are also emitted via the 'error' event; keep the state in sync.
				this.setPhase('error', { error: userMessageForError(error) });
			})
			.finally(() => {
				this.checking = false;
			});
		return { ok: true };
	}

	install(): { ok: boolean } {
		if (this.phase !== 'downloaded' || this.installing) return { ok: false };
		this.setPhase('confirm', { version: this.downloadedVersion });
		return { ok: true };
	}

	confirmInstall(): { ok: boolean } {
		if (this.phase !== 'confirm' || this.installing) return { ok: false };
		this.installing = true;
		try {
			this.autoUpdater.quitAndInstall(false, true);
		} catch (error) {
			this.installing = false;
			this.setPhase('error', { error: userMessageForError(error) });
			return { ok: false };
		}
		return { ok: true };
	}

	cancelInstall(): { ok: boolean } {
		if (this.phase !== 'confirm' || this.installing) return { ok: false };
		this.setPhase('downloaded', { version: this.downloadedVersion });
		return { ok: true };
	}
	startPeriodicCheck(): void {
		if (this.isDev || this.intervalId !== null) return;
		this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL_MS);
	}

	dispose(): void {
		if (this.intervalId !== null) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.autoUpdater.removeAllListeners();
	}

	private setPhase(phase: UpdatePhase, extras: { version?: string; progress?: number; error?: string } = {}): void {
		this.phase = phase;
		if (extras.error !== undefined) {
			this.error = extras.error;
		} else if (phase !== 'error') {
			this.error = undefined;
		}
		if (phase === 'idle' || phase === 'error') {
			this.downloadedVersion = undefined;
		} else if (extras.version !== undefined) {
			this.downloadedVersion = extras.version;
		}

		const state: UpdateState = { phase };
		if (extras.version !== undefined) {
			state.version = extras.version;
		} else if ((phase === 'available' || phase === 'downloaded' || phase === 'confirm') && this.downloadedVersion !== undefined) {
			state.version = this.downloadedVersion;
		}
		if (extras.progress !== undefined) {
			state.progress = extras.progress;
		}
		if (this.error !== undefined) {
			state.error = this.error;
		}
		this.send(state);
	}
}

function defaultIsDev(): boolean {
	// Match the existing codebase convention; do not import electron here so the
	// service stays testable in a Node/Bun environment without Electron binaries.
	return process.env.NODE_ENV === 'development';
}

export function initUpdateService(
	send: UpdateSend,
	options: { autoUpdater?: AppUpdater; isDev?: boolean } = {},
): UpdateService {
	const autoUpdater = options.autoUpdater ?? (defaultAutoUpdater as AppUpdater);
	const isDev = options.isDev ?? defaultIsDev();
	const service = new UpdateServiceImpl(send, autoUpdater, isDev);

	if (!isDev) {
		service.check();
		service.startPeriodicCheck();
	}

	return service;
}
