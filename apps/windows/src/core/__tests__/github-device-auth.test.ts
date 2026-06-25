import { describe, expect, it } from 'bun:test';

import { getGitHubClientID } from '../../main/github-config';
import {
	GitHubAuthErrorResponse,
	GitHubDeviceAuth,
	type GitHubDeviceCodeGrant,
} from '../github-device-auth';

const BASE_TIME = new Date(0);

interface CapturedRequest {
	url: string;
	init: RequestInit | undefined;
	headers: Headers;
	bodyText?: string;
}

type ScriptedResponse = {
	status: number;
	body: BodyInit | null;
	headers?: Record<string, string>;
};

class FetchScript {
	readonly requests: CapturedRequest[] = [];
	readonly sleeps: number[] = [];

	constructor(private readonly responses: ScriptedResponse[]) {}

	fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = input instanceof Request ? input.url : input.toString();
		const bodyText = typeof init?.body === 'string' ? init.body : undefined;
		this.requests.push({
			url,
			init,
			headers: new Headers(init?.headers),
			bodyText,
		});

		const next = this.responses.shift();
		if (!next) {
			throw new Error(`Unexpected fetch without scripted response: ${url}`);
		}

		return new Response(next.body, {
			status: next.status,
			headers: next.headers,
		});
	};

	sleep = async (ms: number): Promise<void> => {
		this.sleeps.push(ms);
	};
}

const grantJSON = JSON.stringify({
	device_code: 'dc123',
	user_code: 'WDJB-MJHT',
	verification_uri: 'https://github.com/login/device',
	expires_in: 900,
	interval: 5,
});

function createAuth(
	script: FetchScript,
	options: {
		now?: () => Date;
		sleep?: (ms: number) => Promise<void>;
	} = {},
): GitHubDeviceAuth {
	return new GitHubDeviceAuth({
		fetch: script.fetch as typeof fetch,
		sleep: options.sleep ?? script.sleep,
		now: options.now ?? (() => BASE_TIME),
	});
}

function makeGrant(): GitHubDeviceCodeGrant {
	return {
		deviceCode: 'dc123',
		userCode: 'WDJB-MJHT',
		verificationURI: 'https://github.com/login/device',
		expiresAt: new Date(900_000),
		intervalMs: 5_000,
	};
}

function expectCommonGitHubRequest(requests: CapturedRequest[]): void {
	for (const request of requests) {
		expect(request.init?.cache).toBe('no-store');
		expect(request.headers.get('User-Agent')).toBe('munkel');
	}
}

async function expectGitHubError(
	promise: Promise<unknown>,
	expected: {
		code: GitHubAuthErrorResponse['code'];
		status?: number;
	},
): Promise<void> {
	try {
		await promise;
		throw new Error(`Expected GitHubAuthErrorResponse(${expected.code})`);
	} catch (error) {
		expect(error).toBeInstanceOf(GitHubAuthErrorResponse);
		const authError = error as GitHubAuthErrorResponse;
		expect(authError.code).toBe(expected.code);
		expect(authError.status).toBe(expected.status);
	}
}

describe('GitHubDeviceAuth', () => {
	it('requestDeviceCode parses the device grant', async () => {
		const script = new FetchScript([
			{
				status: 200,
				body: grantJSON,
				headers: { 'Content-Type': 'application/json' },
			},
		]);

		const grant = await createAuth(script, { now: () => new Date(0) }).requestDeviceCode();

		expect(grant).toEqual({
			deviceCode: 'dc123',
			userCode: 'WDJB-MJHT',
			verificationURI: 'https://github.com/login/device',
			expiresAt: new Date(900_000),
			intervalMs: 5_000,
		});

		expect(script.requests).toHaveLength(1);
		expect(script.requests[0]?.url).toBe('https://github.com/login/device/code');
		expect(script.requests[0]?.init?.method).toBe('POST');
		expect(script.requests[0]?.headers.get('Accept')).toBe('application/json');
		expect(script.requests[0]?.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
		expect(new URLSearchParams(script.requests[0]?.bodyText).get('client_id')).toBe(getGitHubClientID());
		expectCommonGitHubRequest(script.requests);
	});

	it('requestDeviceCode maps device_flow_disabled', async () => {
		const script = new FetchScript([
			{
				status: 200,
				body: JSON.stringify({ error: 'device_flow_disabled' }),
				headers: { 'Content-Type': 'application/json' },
			},
		]);

		await expectGitHubError(createAuth(script).requestDeviceCode(), {
			code: 'device_flow_disabled',
		});
		expectCommonGitHubRequest(script.requests);
	});

	it('pollForAccessToken succeeds after authorization_pending and slow_down', async () => {
		const script = new FetchScript([
			{ status: 200, body: JSON.stringify({ error: 'authorization_pending' }) },
			{ status: 200, body: JSON.stringify({ error: 'slow_down', interval: 10 }) },
			{ status: 200, body: JSON.stringify({ access_token: 'gho_abc', token_type: 'bearer', scope: '' }) },
		]);

		const token = await createAuth(script).pollForAccessToken(makeGrant());

		expect(token).toBe('gho_abc');
		expect(script.sleeps).toEqual([5_000, 5_000, 10_000]);
		expect(script.requests).toHaveLength(3);
		for (const request of script.requests) {
			expect(request.url).toBe('https://github.com/login/oauth/access_token');
			expect(request.init?.method).toBe('POST');
			expect(request.bodyText).toContain('device_code=dc123');
			expect(request.bodyText).toContain(
				'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code',
			);
		}
		expectCommonGitHubRequest(script.requests);
	});

	it('pollForAccessToken maps expired_token from the server', async () => {
		const script = new FetchScript([
			{ status: 200, body: JSON.stringify({ error: 'expired_token' }) },
		]);

		await expectGitHubError(createAuth(script).pollForAccessToken(makeGrant()), {
			code: 'expired',
		});
		expect(script.sleeps).toEqual([5_000]);
		expectCommonGitHubRequest(script.requests);
	});

	it('pollForAccessToken throws expired once the deadline is crossed locally', async () => {
		const script = new FetchScript([]);
		let currentMs = 0;

		const auth = createAuth(script, {
			now: () => new Date(currentMs),
			sleep: async (ms) => {
				script.sleeps.push(ms);
				currentMs += ms;
			},
		});

		await expectGitHubError(
			auth.pollForAccessToken({
				...makeGrant(),
				expiresAt: new Date(4_999),
			}),
			{
				code: 'expired',
			},
		);

		expect(script.sleeps).toEqual([5_000]);
		expect(script.requests).toHaveLength(0);
	});

	it('pollForAccessToken maps access_denied', async () => {
		const script = new FetchScript([
			{ status: 200, body: JSON.stringify({ error: 'access_denied' }) },
		]);

		await expectGitHubError(createAuth(script).pollForAccessToken(makeGrant()), {
			code: 'access_denied',
		});
		expectCommonGitHubRequest(script.requests);
	});

	it('fetchUser parses the profile and sends the expected headers', async () => {
		const script = new FetchScript([
			{
				status: 200,
				body: JSON.stringify({
					login: 'octocat',
					name: 'The Octocat',
					avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
				}),
				headers: { 'Content-Type': 'application/json' },
			},
		]);

		const user = await createAuth(script).fetchUser('gho_abc');

		expect(user).toEqual({
			login: 'octocat',
			name: 'The Octocat',
			avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
		});
		expect(script.requests).toHaveLength(1);
		expect(script.requests[0]?.url).toBe('https://api.github.com/user');
		expect(script.requests[0]?.init?.method).toBe('GET');
		expect(script.requests[0]?.headers.get('Authorization')).toBe('Bearer gho_abc');
		expect(script.requests[0]?.headers.get('Accept')).toBe('application/vnd.github+json');
		expect(script.requests[0]?.headers.get('X-GitHub-Api-Version')).toBe('2022-11-28');
		expectCommonGitHubRequest(script.requests);
	});

	it('fetchUser accepts a null name', async () => {
		const script = new FetchScript([
			{
				status: 200,
				body: JSON.stringify({
					login: 'octocat',
					name: null,
					avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
				}),
				headers: { 'Content-Type': 'application/json' },
			},
		]);

		const user = await createAuth(script).fetchUser('gho_abc');

		expect(user).toEqual({
			login: 'octocat',
			name: undefined,
			avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
		});
		expectCommonGitHubRequest(script.requests);
	});

	it('fetchAvatar appends the requested size to an existing query string', async () => {
		const script = new FetchScript([
			{ status: 200, body: new Uint8Array([1, 2, 3, 4]) },
		]);

		const bytes = await createAuth(script).fetchAvatar(
			'https://avatars.githubusercontent.com/u/583231?v=4',
			128,
		);

		expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
		expect(script.requests).toHaveLength(1);
		expect(script.requests[0]?.url).toBe(
			'https://avatars.githubusercontent.com/u/583231?v=4&s=128',
		);
		expectCommonGitHubRequest(script.requests);
	});

	it('fetchAvatar throws on HTTP error', async () => {
		const script = new FetchScript([
			{ status: 404, body: 'missing' },
		]);

		await expectGitHubError(
			createAuth(script).fetchAvatar('https://avatars.githubusercontent.com/u/0', 128),
			{
				code: 'http',
				status: 404,
			},
		);
		expectCommonGitHubRequest(script.requests);
	});
});
