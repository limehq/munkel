/**
 * Local IPC contract between the Munkel tray/menu-bar app and the `munkel`
 * CLI: newline-delimited JSON, one request/response per connection.
 *
 * See {@link ../PROTOCOL.md} for the full Munkel wire protocol v1 spec.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ControlRequest {
  action: string;
  group?: string;
  to?: string;
  text?: string;
  /**
   * Absolute paths to image files (an album). The app reads, seals and
   * uploads them, so the bytes never cross the pipe. Both macOS and Windows
   * support this end-to-end; see `control-handlers.ts` for validation.
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
 *
 * This is the legacy, predictable name. Newer app builds write a randomised
 * pipe name to {@link getControlPipePath} on startup; {@link readControlPipeName}
 * prefers that file and falls back to this function when it is missing.
 */
export function buildPipeName(username?: string): string {
  const user = username ?? process.env.USERNAME ?? process.env.USER ?? 'default';
  return `\\\\.\\pipe\\Munkel-${user}-Control`;
}

/**
 * Generate an unpredictable Windows named-pipe name. The random suffix makes
 * the path unguessable for other processes on the same session, which replaces
 * the DACL we cannot set from plain Node.js.
 */
export function generatePipeName(username?: string): string {
  const user = username ?? process.env.USERNAME ?? process.env.USER ?? 'default';
  const suffix = randomBytes(16).toString('hex');
  return `\\\\.\\pipe\\Munkel-${user}-${suffix}`;
}

/**
 * Path to the file where the running app publishes its current control pipe
 * name. The file lives in a user-specific directory so other users cannot read
 * it (Windows: %LOCALAPPDATA% is profile-private; macOS/Linux: 0o600 is set).
 */
export function getControlPipePath(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? homedir(), 'Munkel', 'control.pipe');
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'munkel',
    'control.pipe',
  );
}

/**
 * Read the current control pipe name from the file written by the running app.
 * Falls back to the legacy predictable name when the file is missing.
 */
export function readControlPipeName(): string {
  const path = getControlPipePath();
  try {
    return readFileSync(path, 'utf8').trim() || buildPipeName();
  } catch {
    return buildPipeName();
  }
}

/**
 * Persist the control pipe name so the CLI can discover it. The containing
 * directory is created if necessary. On POSIX the file is created with 0o600;
 * on Windows the file is already protected by the profile-private LOCALAPPDATA
 * directory.
 */
export function writeControlPipeName(pipeName: string): void {
  const path = getControlPipePath();
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(path, pipeName, { mode: 0o600 });
}
