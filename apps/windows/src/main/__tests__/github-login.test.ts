import { describe, it, expect } from 'bun:test';
import { isAllowedGitHubVerificationUrl } from '../github-login-url';

describe('github-login', () => {
	describe('isAllowedGitHubVerificationUrl', () => {
		it('allows the official GitHub device flow URL', () => {
			expect(isAllowedGitHubVerificationUrl('https://github.com/login/device')).toBe(true);
		});

		it('allows URLs with query parameters', () => {
			expect(
				isAllowedGitHubVerificationUrl('https://github.com/login/device?user_code=ABC-DEF'),
			).toBe(true);
		});

		it('rejects non-https protocols', () => {
			expect(isAllowedGitHubVerificationUrl('http://github.com/login/device')).toBe(false);
			expect(isAllowedGitHubVerificationUrl('file:///etc/passwd')).toBe(false);
		});

		it('rejects URLs without the github.com hostname', () => {
			expect(isAllowedGitHubVerificationUrl('https://evil.com/github.com/login/device')).toBe(
				false,
			);
			expect(isAllowedGitHubVerificationUrl('https://github.com.evil.com/login/device')).toBe(
				false,
			);
		});

		it('rejects github.com URLs outside the device flow path', () => {
			expect(isAllowedGitHubVerificationUrl('https://github.com/')).toBe(false);
			expect(isAllowedGitHubVerificationUrl('https://github.com/login/oauth/authorize')).toBe(
				false,
			);
			expect(isAllowedGitHubVerificationUrl('https://github.com/settings/profile')).toBe(false);
		});

		it('rejects malformed URLs', () => {
			expect(isAllowedGitHubVerificationUrl('not a url')).toBe(false);
			expect(isAllowedGitHubVerificationUrl('')).toBe(false);
		});
	});
});
