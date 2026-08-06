export function isAllowedGitHubVerificationUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === 'https:' &&
			parsed.hostname === 'github.com' &&
			parsed.pathname.startsWith('/login/device')
		);
	} catch {
		return false;
	}
}
