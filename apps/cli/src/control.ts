/**
 * Wire-protocol types shared by the `munkel` CLI and the system-tray app.
 *
 * This file is a deliberate copy of `apps/windows/src/core/control.ts`:
 * the same JSON shape travels over the macOS app's Unix-domain socket and
 * the Windows app's named pipe. Keeping the types local to each consumer
 * avoids a monorepo restructure while preserving the wire contract as the
 * single source of truth — both sides MUST stay byte-compatible with
 * `apps/macos/Sources/MunkelKit/ControlProtocol.swift`.
 */

export interface ControlRequest {
	action: string;
	group?: string;
	to?: string;
	text?: string;
	/**
	 * Absolute paths to image files (an album). The app reads, seals and
	 * uploads them, so the bytes never cross the pipe. Both the macOS and
	 * Windows apps support this end-to-end (Windows since Milestone 6.5,
	 * branch `platform/windows/image-payload`).
	 */
	imagePaths?: string[];
}

export interface ControlGroupInfo {
	code: string;
	connected: boolean;
	members: string[];
}

export interface ControlResponse {
	ok: boolean;
	error?: string;
	groups?: ControlGroupInfo[];
}

/**
 * Build the Windows named-pipe path for the per-user Munkel control channel.
 * Mirrors `apps/windows/src/core/control.ts` `buildPipeName`.
 */
export function buildPipeName(username?: string): string {
	const user = username ?? process.env.USERNAME ?? process.env.USER ?? "default";
	return `\\\\.\\pipe\\Munkel-${user}-Control`;
}
