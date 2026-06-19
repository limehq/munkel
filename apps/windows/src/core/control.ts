/**
 * Contract between the Windows system-tray app (named-pipe server) and the
 * `munkel` CLI: newline-delimited JSON, one request/response per connection.
 */

export interface ControlRequest {
  action: string;
  group?: string;
  to?: string;
  text?: string;
  /**
   * Absolute paths to image files (an album). The Windows app reads, seals
   * and uploads them, so the bytes never cross the pipe. The macOS app
   * supports this end-to-end; the Windows app currently rejects it with a
   * clear error — see `control-handlers.ts`.
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
 */
export function buildPipeName(username?: string): string {
  const user = username ?? process.env.USERNAME ?? process.env.USER ?? 'default';
  return `\\\\.\\pipe\\Munkel-${user}-Control`;
}
