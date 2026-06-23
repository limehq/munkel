/**
 * R2 blob upload helper — `PUT /blob/:group/:key` against the relay.
 *
 * The relay server (`apps/server/src/blob.ts`) stores opaque ciphertext
 * under `<group>/<key>` namespaced by the `groupId`. The client seals
 * the image bytes with `messageKey` BEFORE upload, so the server
 * never sees plaintext — only opaque AES-256-GCM ciphertext.
 *
 * URL derivation: `relayUrl` is the WebSocket address the GroupSession
 * already knows (`ws://host[:port]/ws?group=...&member=...`). The blob
 * REST endpoint shares the same origin with `ws`/`wss` swapped for
 * `http`/`https` and the `/ws?...` path stripped. Trailing slashes on
 * the WS URL are normalized.
 *
 * Body cap (`MAX_BLOB_BYTES = 3 MiB`) mirrors `apps/server/src/blob.ts`
 * and includes the 28-byte AES-GCM envelope headroom over the 2 MiB
 * client-side `MAX_FULL_BYTES`.
 */

export const MAX_BLOB_BYTES = 3 * 1024 * 1024;

/** Throws if `relayUrl` is not a ws:// or wss:// URL. */
export function blobBaseUrl(relayUrl: string): string {
	const u = new URL(relayUrl);
	if (u.protocol !== 'ws:' && u.protocol !== 'wss:') {
		throw new Error(`relayUrl must use ws:// or wss:// (got ${u.protocol})`);
	}
	if (u.username || u.password) {
		throw new Error('relayUrl must not include credentials');
	}
	u.protocol = u.protocol === 'ws:' ? 'http:' : 'https:';
	u.search = '';
	u.hash = '';
	// The relay's WS path is `/ws`; the blob REST endpoint shares the
	// origin but not the `/ws` segment. Any other path (e.g. a reverse
	// proxy mounted under `/relay/`) is preserved.
	if (u.pathname === '/ws' || u.pathname === '/ws/') {
		u.pathname = '/';
	}
	if (!u.pathname.endsWith('/')) u.pathname += '/';
	return u.toString();
}

/** Generate a 32-char URL-safe random blob key. */
export function generateBlobKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return Buffer.from(bytes).toString('base64url');
}

export interface UploadResult {
	ok: boolean;
	status?: number;
	error?: string;
}

/**
 * PUT sealed ciphertext to `<relay>/blob/<groupId>/<r2Key>`. Returns
 * `{ok:true}` on 204, otherwise a structured failure suitable for
 * surfacing via `SendResult.error`.
 */
export async function uploadBlob(
	relayUrl: string,
	groupId: string,
	r2Key: string,
	body: Uint8Array,
	fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
	if (body.byteLength === 0) {
		return { ok: false, error: 'Empty body' };
	}
	if (body.byteLength > MAX_BLOB_BYTES) {
		return {
			ok: false,
			error: `Body too large (${body.byteLength} bytes; max ${MAX_BLOB_BYTES})`,
		};
	}
	const url = `${blobBaseUrl(relayUrl)}blob/${groupId}/${r2Key}`;
	let res: Response;
	try {
		res = await fetchImpl(url, {
			method: 'PUT',
			body: body as BodyInit,
			headers: { 'content-type': 'application/octet-stream' },
		});
	} catch (err) {
		return {
			ok: false,
			error: `Blob upload failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
	if (res.status === 204) {
		return { ok: true, status: res.status };
	}
	const text = await res.text().catch(() => '');
	return {
		ok: false,
		status: res.status,
		error: `Blob upload failed (${res.status}): ${text || res.statusText}`,
	};
}