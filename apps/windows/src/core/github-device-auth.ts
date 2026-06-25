import { getGitHubClientID } from '../main/github-config';

export interface GitHubDeviceCodeGrant {
	deviceCode: string;
	userCode: string;
	verificationURI: string;
	expiresAt: Date;
	intervalMs: number;
}

export interface GitHubUser {
	login: string;
	name?: string;
	avatarUrl?: string;
}

export type GitHubAuthError = 'device_flow_disabled' | 'expired' | 'access_denied' | 'http' | 'malformed';

export class GitHubAuthErrorResponse extends Error {
	constructor(
		public readonly code: GitHubAuthError,
		public readonly status?: number,
		message?: string,
	) {
		super(message ?? code);
		this.name = 'GitHubAuthErrorResponse';
	}
}

type FetchLike = typeof fetch;
type SleepLike = (ms: number) => Promise<void>;

interface GitHubDeviceAuthOptions {
	fetch?: FetchLike;
	sleep?: SleepLike;
	now?: () => Date;
}

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';

export class GitHubDeviceAuth {
	private readonly clientID: string;
	private readonly fetchImpl: FetchLike;
	private readonly sleepImpl: SleepLike;
	private readonly now: () => Date;

	constructor(options: GitHubDeviceAuthOptions = {}) {
		this.clientID = getGitHubClientID();
		this.fetchImpl = options.fetch ?? fetch;
		this.sleepImpl = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
		this.now = options.now ?? (() => new Date());
	}

	async requestDeviceCode(): Promise<GitHubDeviceCodeGrant> {
		const response = await this.postForm(GITHUB_DEVICE_CODE_URL, [
			['client_id', this.clientID],
		]);
		this.throwOnTopLevelError(response, ['device_flow_disabled']);

		const deviceCode = typeof response.device_code === 'string' ? response.device_code : undefined;
		const userCode = typeof response.user_code === 'string' ? response.user_code : undefined;
		const verificationURI =
			typeof response.verification_uri === 'string' ? response.verification_uri : undefined;
		const expiresIn = this.readNumber(response.expires_in);
		const intervalSeconds = this.readNumber(response.interval);

		if (!deviceCode || !userCode || !verificationURI || expiresIn === undefined || intervalSeconds === undefined) {
			throw new GitHubAuthErrorResponse('malformed');
		}

		return {
			deviceCode,
			userCode,
			verificationURI,
			expiresAt: new Date(this.now().getTime() + expiresIn * 1000),
			intervalMs: intervalSeconds * 1000,
		};
	}

	async pollForAccessToken(grant: GitHubDeviceCodeGrant): Promise<string> {
		let intervalMs = Math.max(grant.intervalMs, 1000);

		while (true) {
			this.throwIfExpired(grant.expiresAt);
			await this.sleepImpl(intervalMs);
			this.throwIfExpired(grant.expiresAt);

			const response = await this.postForm(GITHUB_ACCESS_TOKEN_URL, [
				['client_id', this.clientID],
				['device_code', grant.deviceCode],
				['grant_type', 'urn:ietf:params:oauth:grant-type:device_code'],
			]);

			if (typeof response.access_token === 'string') {
				return response.access_token;
			}

			switch (response.error) {
				case 'authorization_pending':
					continue;
				case 'slow_down': {
					const serverIntervalMs = this.readNumber(response.interval);
					intervalMs = Math.max(
						intervalMs + 5000,
						serverIntervalMs === undefined ? 0 : serverIntervalMs * 1000,
					);
					continue;
				}
				case 'expired_token':
					throw new GitHubAuthErrorResponse('expired');
				case 'access_denied':
					throw new GitHubAuthErrorResponse('access_denied');
				case 'device_flow_disabled':
					throw new GitHubAuthErrorResponse('device_flow_disabled');
				default:
					throw new GitHubAuthErrorResponse('malformed');
			}
		}
	}

	async fetchUser(token: string): Promise<GitHubUser> {
		const response = await this.sendJson(GITHUB_USER_URL, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});

		const login = typeof response.login === 'string' ? response.login : undefined;
		if (!login) {
			throw new GitHubAuthErrorResponse('malformed');
		}

		return {
			login,
			name: typeof response.name === 'string' ? response.name : undefined,
			avatarUrl: typeof response.avatar_url === 'string' ? response.avatar_url : undefined,
		};
	}

	async fetchAvatar(url: string, pixelSize: number): Promise<Uint8Array> {
		const sizedUrl = new URL(url);
		sizedUrl.searchParams.append('s', String(pixelSize));

		const response = await this.fetchImpl(sizedUrl.toString(), {
			cache: 'no-store',
			headers: {
				'User-Agent': 'munkel',
			},
		});

		if (!response.ok) {
			throw new GitHubAuthErrorResponse('http', response.status);
		}

		const bytes = await response.arrayBuffer();
		return new Uint8Array(bytes);
	}

	private async postForm(url: string, entries: Array<[string, string]>): Promise<Record<string, unknown>> {
		const body = new URLSearchParams(entries).toString();
		return this.sendJson(url, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		});
	}

	private async sendJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
		const headers = new Headers(init.headers);
		headers.set('User-Agent', 'munkel');

		const response = await this.fetchImpl(url, {
			...init,
			cache: 'no-store',
			headers,
		});

		if (!response.ok) {
			throw new GitHubAuthErrorResponse('http', response.status);
		}

		let json: unknown;
		try {
			json = await response.json();
		} catch {
			throw new GitHubAuthErrorResponse('malformed');
		}

		if (!json || typeof json !== 'object' || Array.isArray(json)) {
			throw new GitHubAuthErrorResponse('malformed');
		}

		return json as Record<string, unknown>;
	}

	private throwOnTopLevelError(
		response: Record<string, unknown>,
		allowedErrors: GitHubAuthError[],
	): void {
		const error = typeof response.error === 'string' ? response.error : undefined;
		if (!error) {
			return;
		}
		if (allowedErrors.includes(error as GitHubAuthError)) {
			throw new GitHubAuthErrorResponse(error as GitHubAuthError);
		}
		throw new GitHubAuthErrorResponse('malformed');
	}

	private throwIfExpired(expiresAt: Date): void {
		if (this.now().getTime() >= expiresAt.getTime()) {
			throw new GitHubAuthErrorResponse('expired');
		}
	}

	private readNumber(value: unknown): number | undefined {
		return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
	}
}
