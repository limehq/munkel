/**
 * R2 blob download helper — `GET /blob/:group/:key` against the relay.
 *
 * Mirror of `blob-upload.ts`. The relay returns opaque AES-256-GCM ciphertext
 * that the caller must open with `openRaw(ciphertext, messageKey)`. This
 * module only fetches bytes; it never touches keys or plaintext.
 *
 * Cap (`maxBytes`, default `MAX_BLOB_BYTES`) mirrors the server's per-blob
 * limit in `apps/server/src/blob.ts` and macOS
 * `GroupSession.maxIncomingImageBytes` (3 MiB + small envelope headroom —
 * we use the shared `MAX_BLOB_BYTES` which already includes envelope room
 * over the 2 MiB client `MAX_FULL_BYTES`).
 */

import { MAX_BLOB_BYTES } from '@munkel/shared-wire/wire-constants';
import { blobBaseUrl } from './blob-upload.js';

export interface DownloadResult {
	ok: boolean;
	status?: number;
	/** Opaque sealed ciphertext on success. */
	body?: Uint8Array;
	error?: string;
}

/**
 * GET sealed ciphertext from `<relay>/blob/<groupId>/<r2Key>`.
 * Returns `{ok:true, body}` on 200 with a non-empty body ≤ maxBytes;
 * otherwise a structured failure (never throws on HTTP/network errors).
 */
export async function downloadBlob(
	relayUrl: string,
	groupId: string,
	r2Key: string,
	maxBytes: number = MAX_BLOB_BYTES,
	fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> {
	if (!groupId || !r2Key) {
		return { ok: false, error: 'Missing groupId or r2Key' };
	}
	if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
		return { ok: false, error: 'Invalid maxBytes' };
	}

	const url = `${blobBaseUrl(relayUrl)}blob/${groupId}/${r2Key}`;
	let res: Response;
	try {
		res = await fetchImpl(url, { method: 'GET' });
	} catch (err) {
		return {
			ok: false,
			error: `Blob download failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	if (res.status !== 200) {
		const text = await res.text().catch(() => '');
		return {
			ok: false,
			status: res.status,
			error: `Blob download failed (${res.status}): ${text || res.statusText}`,
		};
	}

	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > maxBytes) {
		return {
			ok: false,
			status: res.status,
			error: `Blob too large (declared ${declared} bytes; max ${maxBytes})`,
		};
	}

	let buf: ArrayBuffer;
	try {
		buf = await res.arrayBuffer();
	} catch (err) {
		return {
			ok: false,
			status: res.status,
			error: `Blob download read failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	if (buf.byteLength === 0) {
		return { ok: false, status: res.status, error: 'Empty blob body' };
	}
	if (buf.byteLength > maxBytes) {
		return {
			ok: false,
			status: res.status,
			error: `Blob too large (${buf.byteLength} bytes; max ${maxBytes})`,
		};
	}

	return { ok: true, status: res.status, body: new Uint8Array(buf) };
}
