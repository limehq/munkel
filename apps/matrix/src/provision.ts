// Deterministic, invisible account provisioning. The human never signs up: the
// gateway derives a stable Matrix identity from the per-install `memberId` and
// either registers it (shared-secret admin API) or logs in. Persisting the creds
// keeps the SAME device across reconnects, which is what keeps Megolm alive.
//
// "Accountless" thus becomes a UX truth (no signup, no MXID ever shown), not a
// server truth — see docs/adr/0001-matrix-backend-spike.md.
import { createHash, createHmac } from "node:crypto";

export interface MatrixCreds {
  userId: string;
  accessToken: string;
  deviceId: string;
}

/** Persists derived creds per memberId so reconnects skip registration. */
export interface CredStore {
  get(memberId: string): Promise<MatrixCreds | undefined>;
  put(memberId: string, creds: MatrixCreds): Promise<void>;
}

/** In-memory store — fine for the PoC gateway (crypto is in-memory anyway). */
export class MemoryCredStore implements CredStore {
  private readonly map = new Map<string, MatrixCreds>();
  async get(memberId: string): Promise<MatrixCreds | undefined> {
    return this.map.get(memberId);
  }
  async put(memberId: string, creds: MatrixCreds): Promise<void> {
    this.map.set(memberId, creds);
  }
}

/**
 * Matrix localpart charset is permissive ([a-z0-9._=-/+]); we restrict to
 * `munkel_` + 24 lowercase hex chars — deterministic, collision-safe, short.
 */
export function localpartForMember(memberId: string): string {
  const h = createHash("sha256").update(`munkel:user:${memberId}`).digest("hex");
  return `munkel_${h.slice(0, 24)}`;
}

export function mxidForMember(memberId: string, serverName: string): string {
  return `@${localpartForMember(memberId)}:${serverName}`;
}

/** Deterministic password from a gateway-only pepper (never the circle code/key). */
export function passwordForMember(memberId: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`munkel:pw:${memberId}`).digest("base64url");
}

export interface EnsureUserOpts {
  baseUrl: string;
  sharedSecret: string;
  pwPepper: string;
  memberId: string;
  store?: CredStore;
}

/**
 * Register the user via the shared-secret admin API. Returns the creds of the
 * device the register call created (which we then use directly — no second login,
 * so the account has exactly ONE device and no keyless "ghost" device to confuse
 * Megolm key sharing). Returns null if the user already exists (M_USER_IN_USE).
 */
async function sharedSecretRegister(
  baseUrl: string,
  sharedSecret: string,
  username: string,
  password: string,
): Promise<MatrixCreds | null> {
  const nonceRes = await fetch(`${baseUrl}/_synapse/admin/v1/register`);
  if (!nonceRes.ok) throw new Error(`register nonce failed: ${nonceRes.status} ${await nonceRes.text()}`);
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const mac = createHmac("sha1", sharedSecret)
    .update(nonce).update("\x00")
    .update(username).update("\x00")
    .update(password).update("\x00")
    .update("notadmin")
    .digest("hex");

  const res = await fetch(`${baseUrl}/_synapse/admin/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce, username, password, admin: false, mac }),
  });
  if (res.ok) {
    const j = (await res.json()) as { user_id: string; access_token: string; device_id: string };
    return { userId: j.user_id, accessToken: j.access_token, deviceId: j.device_id };
  }
  // 400 M_USER_IN_USE just means we already provisioned this install — fall back to login.
  const body = await res.text();
  if (res.status === 400 && body.includes("M_USER_IN_USE")) return null;
  throw new Error(`register failed: ${res.status} ${body}`);
}

async function passwordLogin(baseUrl: string, username: string, password: string): Promise<MatrixCreds> {
  const res = await fetch(`${baseUrl}/_matrix/client/v3/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: username },
      password,
      // Let the server assign a FRESH device id. Reusing a device id with a fresh
      // (in-memory) crypto store would fail the key upload (the device already has
      // immutable identity keys), leaving the live device keyless => peers withhold
      // the Megolm key => "unable to decrypt". A fresh device per session avoids it.
      initial_device_display_name: "Munkel (matrix-gateway)",
    }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { user_id: string; access_token: string; device_id: string };
  return { userId: j.user_id, accessToken: j.access_token, deviceId: j.device_id };
}

/**
 * Idempotently obtain Matrix creds for an install: cached -> return; else ensure
 * the account exists (shared-secret register) and log in with the derived,
 * stable device id. Persist for next time.
 */
export async function ensureMatrixUser(opts: EnsureUserOpts): Promise<MatrixCreds> {
  const username = localpartForMember(opts.memberId);
  const password = passwordForMember(opts.memberId, opts.pwPepper);

  // Provision a fresh device every session. New install -> register (which mints
  // a device); already provisioned -> login (server assigns a fresh device). We
  // do NOT cache+reuse a device, because the in-memory crypto store can't adopt a
  // device that already has identity keys on the server (see passwordLogin). The
  // optional store is kept only to record that the user exists.
  const creds =
    (await sharedSecretRegister(opts.baseUrl, opts.sharedSecret, username, password)) ??
    (await passwordLogin(opts.baseUrl, username, password));
  await opts.store?.put(opts.memberId, creds);
  return creds;
}
