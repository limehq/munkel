const DEFAULT_CLIENT_ID = 'Ov23liAGgt648fdFmImz';

// public OAuth client ID = same as macOS GitHubConfig.swift; device flow needs no secret; override via MUNKEL_GITHUB_CLIENT_ID
export function getGitHubClientID(): string {
	const override = process.env.MUNKEL_GITHUB_CLIENT_ID?.trim();
	return override && override.length > 0 ? override : DEFAULT_CLIENT_ID;
}
