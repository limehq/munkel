import { Hono } from 'hono';
import { GROUP_ID_REGEX } from './protocol';
import { createLogger } from './lib/logger';

export const BLOB_KEY_REGEX = /^[A-Za-z0-9_-]{16,128}$/;
export const MAX_BLOB_BYTES = 3 * 1024 * 1024;
export const NOTCH_SURVIVAL_MS = 60 * 1000;
export const BLOB_TTL_MS = Math.round(NOTCH_SURVIVAL_MS * 1.1);

export interface BlobEnv {
  BLOBS: R2Bucket;
}

const log = createLogger('blob');

function objectKey(group: string, key: string): string {
  return `${group}/${key}`;
}

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

export async function sweepExpiredBlobs(bucket: R2Bucket): Promise<number> {
  const now = Date.now();
  let deleted = 0;
  let cursor: string | undefined;
  do {
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
