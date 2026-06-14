/**
 * Contract between the Windows system-tray app (named-pipe server) and the
 * `munkel` CLI: newline-delimited JSON, one request/response per connection.
 */

export interface ControlRequest {
  action: string;
  group?: string;
  to?: string;
  text?: string;
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
