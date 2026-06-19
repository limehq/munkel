import { Hono } from 'hono';
import { GROUP_ID_REGEX } from './protocol';
import { createLogger } from './lib/logger';

/**
 * R2-backed image blobs — the second persistence surface in an otherwise
 * "stores nothing" system, added so full-resolution images (which never fit
 * the 48 KiB relay frame) can travel out-of-band while the relay still only
 * sees a tiny encrypted pointer (see ../../macos/.../AppPayload image kind).
 *
 * The Worker is deliberately blind: clients seal the image with the group
 * `messageKey` (which never leaves a client) BEFORE upload, so R2 only ever
 * holds opaque ciphertext. The object is namespaced by `groupId` and keyed by
 * a client-generated random id; knowing both is the only access control —
 * the same unguessable-id model the WebSocket relay uses.
 *
 * Ephemerality is preserved by a short logical TTL tied to how long a message
 * stays alive in the recipient's notch: a blob older than {@link BLOB_TTL_MS}
 * is treated as gone (404) and deleted on the next GET. A per-minute cron runs
 * {@link sweepExpiredBlobs} to physically delete blobs that were never fetched,
 * so nothing outlives the window (see index.ts / wrangler.toml).
 */

/** Client-generated per-image object id: URL-safe, 16–128 chars. */
export const BLOB_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Max ciphertext bytes accepted per blob: a ~2 MiB image plus the 28-byte
 * AES-GCM envelope and headroom. Bounds an unauthenticated write (the group
 * id is the only credential) to billable storage.
 */
export const MAX_BLOB_BYTES = 3 * 1024 * 1024;

/**
 * How long a message stays alive in the recipient's notch — the basis for the
 * blob's lifetime (the blob need not outlive the message it points to). Mirrors
 * NotchPresenter.historyWindow (60 s) on the macOS client.
 */
export const NOTCH_SURVIVAL_MS = 60 * 1000; // 60 s

/**
 * A blob older than this is expired (404 + delete). The notch-survival window
 * plus a 10% grace, so an in-flight fetch right at the edge still succeeds.
 */
export const BLOB_TTL_MS = Math.round(NOTCH_SURVIVAL_MS * 1.1); // 66 s

export interface BlobEnv {
  BLOBS: R2Bucket;
}

const log = createLogger('blob');

/** R2 object key: group-namespaced so one prefix holds a circle's blobs. */
function objectKey(group: string, key: string): string {
  return `${group}/${key}`;
}

/**
 * Mounts `PUT /blob/:group/:key` and `GET /blob/:group/:key` on `app`. The
 * routes store and serve opaque bytes; all crypto happens on the clients.
 */
export function registerBlobRoutes<E extends BlobEnv>(app: Hono<{ Bindings: E }>): void {
  app.put('/blob/:group/:key', async (c) => {
    const group = c.req.param('group');
    const key = c.req.param('key');
    if (!GROUP_ID_REGEX.test(group)) {
      return c.text('Invalid group', 400);
    }
    if (!BLOB_KEY_REGEX.test(key)) {
      return c.text('Invalid key', 400);
    }

    // Reject early on the declared length, then defensively on the real size
    // (a client can lie about or omit Content-Length).
    const declared = Number(c.req.header('Content-Length'));
    if (Number.isFinite(declared) && declared > MAX_BLOB_BYTES) {
      return c.text('Payload too large', 413);
    }

    const body = await c.req.arrayBuffer();
    if (body.byteLength === 0) {
      return c.text('Empty body', 400);
    }
    if (body.byteLength > MAX_BLOB_BYTES) {
      return c.text('Payload too large', 413);
    }

    await c.env.BLOBS.put(objectKey(group, key), body, {
      customMetadata: { uploadedAt: String(Date.now()) },
    });
    log.info('blob_put', { group, bytes: body.byteLength });
    return c.body(null, 204);
  });

  app.get('/blob/:group/:key', async (c) => {
    const group = c.req.param('group');
    const key = c.req.param('key');
    // Malformed ids can't address a real object — answer 404, not 400, so the
    // route leaks nothing about what exists.
    if (!GROUP_ID_REGEX.test(group) || !BLOB_KEY_REGEX.test(key)) {
      return c.text('Not found', 404);
    }

    const id = objectKey(group, key);
    const object = await c.env.BLOBS.get(id);
    if (!object) {
      return c.text('Not found', 404);
    }

    const uploadedAt = Number(object.customMetadata?.uploadedAt ?? '0');
    if (uploadedAt > 0 && Date.now() - uploadedAt > BLOB_TTL_MS) {
      await c.env.BLOBS.delete(id);
      log.info('blob_expired', { group });
      return c.text('Not found', 404);
    }

    const bytes = await object.arrayBuffer();
    return c.body(bytes, 200, { 'Content-Type': 'application/octet-stream' });
  });
}

/**
 * Physically deletes blobs past {@link BLOB_TTL_MS}. The GET path already
 * 404s + deletes expired blobs on access; this sweep covers blobs that were
 * never fetched (e.g. all recipients were offline), so nothing outlives the
 * window. Driven by a per-minute cron (see index.ts / wrangler.toml). Returns
 * the number deleted.
 */
export async function sweepExpiredBlobs(bucket: R2Bucket): Promise<number> {
  const now = Date.now();
  let deleted = 0;
  let cursor: string | undefined;
  do {
    // `include` is honored by the runtime; the bundled (non-experimental) R2
    // types omit it, so assert past the excess-property check.
    const listing = await bucket.list({ include: ['customMetadata'], cursor } as R2ListOptions);
    const expiredKeys = listing.objects
      .filter((object) => {
        const uploadedAt = Number(object.customMetadata?.uploadedAt ?? '0');
        return uploadedAt > 0 && now - uploadedAt > BLOB_TTL_MS;
      })
      .map((object) => object.key);
    if (expiredKeys.length > 0) {
      await bucket.delete(expiredKeys);
      deleted += expiredKeys.length;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  if (deleted > 0) {
    log.info('blob_sweep', { deleted });
  }
  return deleted;
}
