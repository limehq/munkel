import { clipboard, shell } from 'electron';
import { createAvatarCodec, MAX_DECODED_PIXELS } from '../core/avatar';
import {
	GitHubAuthErrorResponse,
	GitHubDeviceAuth,
	type GitHubAuthError,
} from '../core/github-device-auth';
import type { GitHubLoginPhase, GitHubLoginState } from '../shared/types';
import type { AppState } from './session-store';

export type { GitHubLoginPhase, GitHubLoginState } from '../shared/types';

class GitHubLoginCancelledError extends Error {
	constructor() {
		super('GitHub login cancelled');
		this.name = 'GitHubLoginCancelledError';
	}
}

export class GitHubLoginService {
	private readonly avatarCodec = createAvatarCodec();
	private githubLoginTask: Promise<void> | null = null;
	private githubLoginGeneration = 0;
	private state: GitHubLoginState = { phase: 'idle' };

	constructor(
		private readonly appState: AppState,
		private readonly pushState: (state: GitHubLoginState) => void,
	) {}

	getState(): GitHubLoginState {
		return this.state;
	}

	startGitHubLogin(): void {
		this.githubLoginGeneration += 1;
		const generation = this.githubLoginGeneration;
		this.setState({ phase: 'requesting' });

		const task = this.runGitHubLogin(generation).finally(() => {
			if (this.githubLoginTask === task) {
				this.githubLoginTask = null;
			}
		});
		this.githubLoginTask = task;
	}

	cancelGitHubLogin(): void {
		this.githubLoginGeneration += 1;
		this.githubLoginTask = null;
		this.setState({ phase: 'idle' });
	}

	logoutGitHub(): void {
		this.cancelGitHubLogin();
		const current = this.appState.getIdentity();
		this.appState.updateIdentity({
			displayName: current.displayName,
			avatar: undefined,
			githubLogin: undefined,
		});
		this.appState.flushProfileBroadcast();
	}

	private async runGitHubLogin(generation: number): Promise<void> {
		const auth = new GitHubDeviceAuth({
			sleep: async (ms) => {
				this.ensureCurrentGeneration(generation);
				await new Promise((resolve) => setTimeout(resolve, ms));
				this.ensureCurrentGeneration(generation);
			},
		});

		try {
			const grant = await auth.requestDeviceCode();
			this.ensureCurrentGeneration(generation);

			clipboard.writeText(grant.userCode);
			void shell.openExternal(grant.verificationURI).catch(() => undefined);
			this.setState({ phase: 'awaiting', userCode: grant.userCode });

			const token = await auth.pollForAccessToken(grant);
			this.ensureCurrentGeneration(generation);
			this.setState({ phase: 'fetching' });

			const user = await auth.fetchUser(token);
			let avatarBase64: string | undefined;

			if (user.avatarUrl) {
				try {
					const rawAvatar = await auth.fetchAvatar(user.avatarUrl, MAX_DECODED_PIXELS);
					const encodedAvatar = await this.avatarCodec.encode(rawAvatar);
					avatarBase64 = Buffer.from(encodedAvatar).toString('base64');
				} catch {
					avatarBase64 = undefined;
				}
			}

			this.ensureCurrentGeneration(generation);
			this.appState.updateIdentity({
				displayName: firstName(user.name, user.login),
				avatar: avatarBase64,
				githubLogin: user.login,
			});
			this.appState.flushProfileBroadcast();
			this.setState({ phase: 'idle' });
		} catch (error) {
			if (error instanceof GitHubLoginCancelledError) {
				return;
			}
			if (generation !== this.githubLoginGeneration) {
				return;
			}
			this.setState({ phase: 'failed', error: messageForError(error) });
		}
	}

	private ensureCurrentGeneration(generation: number): void {
		if (generation !== this.githubLoginGeneration) {
			throw new GitHubLoginCancelledError();
		}
	}

	private setState(state: GitHubLoginState): void {
		this.state = state;
		this.pushState(state);
	}
}

function firstName(name: string | undefined, login: string): string {
	const trimmed = name?.trim();
	if (!trimmed) {
		return login;
	}

	const [first] = trimmed.split(/\s+/);
	return first || login;
}

function messageForError(error: unknown): string {
	if (error instanceof GitHubAuthErrorResponse) {
		return messageForGitHubError(error.code);
	}
	return 'No connection to GitHub.';
}

function messageForGitHubError(error: GitHubAuthError): string {
	switch (error) {
		case 'device_flow_disabled':
			return "Device Flow isn't enabled for the OAuth app (see README).";
		case 'expired':
			return 'Code expired. Try again.';
		case 'access_denied':
			return 'Sign-in denied on github.com.';
		case 'http':
		case 'malformed':
			return 'GitHub responded unexpectedly. Try again.';
	}
}
