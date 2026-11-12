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
  warning?: string;
  skipped?: Array<{ path: string; reason: string }>;
  groups?: ControlGroupInfo[];
}

/** Config dir used for the published pipe-name file and POSIX sockets. */
function controlConfigDir(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? homedir(), 'Munkel');
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'munkel');
}

function ensureControlConfigDir(): string {
  const dir = controlConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * Build the per-user Munkel control channel address.
 *
 * Windows: named pipe `\\.\pipe\Munkel-<user>-Control`.
 * POSIX: Unix-domain socket under the user config dir (so Linux/macOS
 * cloud/dev hosts can run the Windows app without hanging on a Win32 pipe).
 *
 * Newer app builds write a randomised name via {@link generatePipeName} to
 * {@link getControlPipePath}; {@link readControlPipeName} prefers that file
 * and falls back to this function when it is missing.
 */
export function buildPipeName(username?: string): string {
  const user = username ?? process.env.USERNAME ?? process.env.USER ?? 'default';
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\Munkel-${user}-Control`;
  }
  return join(ensureControlConfigDir(), 'control.sock');
}

/**
 * Generate a non-static control-channel address. The random suffix avoids
 * collisions with stale endpoints from previous runs; it is not a secret.
 * On Windows the named-pipe namespace is enumerable by any unprivileged
 * local process, so the name provides no access control. What restricts
 * access instead: on POSIX, the 0o700 user config directory the socket
 * lives in; on Windows, the default security descriptor libuv binds the
 * pipe with (cross-user scope unverified, tracked in issue #69).
 */
export function generatePipeName(username?: string): string {
  const user = username ?? process.env.USERNAME ?? process.env.USER ?? 'default';
  const suffix = randomBytes(16).toString('hex');
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\Munkel-${user}-${suffix}`;
  }
  return join(ensureControlConfigDir(), `control-${suffix}.sock`);
}

/**
 * Path to the file where the running app publishes its current control pipe
 * name. The file lives in a user-specific config directory so other local
 * users cannot read it (Windows: the default profile ACL makes
 * %LOCALAPPDATA% inaccessible to other non-admin users; POSIX: this code
 * creates the directory with 0o700 and the file with 0o600, both subject
 * to umask).
 */
export function getControlPipePath(): string {
  return join(controlConfigDir(), 'control.pipe');
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
 * directory is created if necessary with 0o700 (when created by this code;
 * subject to umask on POSIX). The file is created with mode 0o600 (umask
 * applies on POSIX); on
 * Windows the default profile ACL on %LOCALAPPDATA% already restricts the
 * directory to the user, SYSTEM and Administrators.
 */
export function writeControlPipeName(pipeName: string): void {
  const path = getControlPipePath();
  const dir = join(path, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(path, pipeName, { mode: 0o600 });
}
