import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { BLOB_TTL_MS, MAX_BLOB_BYTES, registerBlobRoutes, sweepExpiredBlobs } from '../src/blob';
import type { BlobEnv } from '../src/blob';

/**
 * In-memory stand-in for the bits of R2Bucket the blob routes + sweep use
 * (put/get/delete/list + customMetadata). Exposes its store so a test can age
 * an object to exercise the TTL path.
 */
class FakeBucket {
  readonly store = new Map<string, { bytes: Uint8Array; customMetadata?: Record<string, string> }>();

  async put(key: string, value: ArrayBuffer, opts?: { customMetadata?: Record<string, string> }) {
    this.store.set(key, { bytes: new Uint8Array(value), customMetadata: opts?.customMetadata });
  }

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      customMetadata: entry.customMetadata,
      arrayBuffer: async () => entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength),
    };
  }

  async delete(key: string | string[]) {
    for (const k of Array.isArray(key) ? key : [key]) this.store.delete(k);
  }

  async list(_opts?: { include?: string[]; cursor?: string }) {
    const objects = [...this.store.entries()].map(([key, entry]) => ({ key, customMetadata: entry.customMetadata }));
    return { objects, truncated: false as const, cursor: undefined };
  }
}

const GROUP = 'a'.repeat(32);
const KEY = 'abcdefghijklmnop'; // 16 chars, passes BLOB_KEY_REGEX
const PATH = `/blob/${GROUP}/${KEY}`;

function makeApp(bucket: FakeBucket) {
  const app = new Hono<{ Bindings: BlobEnv }>();
  registerBlobRoutes(app);
  return { app, env: { BLOBS: bucket } as unknown as BlobEnv };
}

describe('blob routes', () => {
  let bucket: FakeBucket;
  let app: Hono<{ Bindings: BlobEnv }>;
  let env: BlobEnv;

  beforeEach(() => {
    bucket = new FakeBucket();
    ({ app, env } = makeApp(bucket));
  });

  it('round-trips an uploaded blob', async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const put = await app.request(PATH, { method: 'PUT', body }, env);
    expect(put.status).toBe(204);

    const get = await app.request(PATH, {}, env);
    expect(get.status).toBe(200);
    expect(get.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(body);
  });

  it('404s an unknown blob', async () => {
    const get = await app.request(PATH, {}, env);
    expect(get.status).toBe(404);
  });

  it('rejects an invalid group', async () => {
    const put = await app.request(`/blob/NOTHEX/${KEY}`, { method: 'PUT', body: new Uint8Array([1]) }, env);
    expect(put.status).toBe(400);
  });

  it('rejects an invalid key', async () => {
    const put = await app.request(`/blob/${GROUP}/short`, { method: 'PUT', body: new Uint8Array([1]) }, env);
    expect(put.status).toBe(400);
  });

  it('rejects an empty body', async () => {
    const put = await app.request(PATH, { method: 'PUT', body: new Uint8Array([]) }, env);
    expect(put.status).toBe(400);
  });

  it('rejects an oversized declared Content-Length', async () => {
    const put = await app.request(
      PATH,
      { method: 'PUT', body: new Uint8Array([1]), headers: { 'Content-Length': String(MAX_BLOB_BYTES + 1) } },
      env,
    );
    expect(put.status).toBe(413);
  });

  it('rejects a body over the byte cap', async () => {
    const big = new Uint8Array(MAX_BLOB_BYTES + 1);
    const put = await app.request(PATH, { method: 'PUT', body: big }, env);
    expect(put.status).toBe(413);
  });

  it('expires and deletes a blob past the TTL on GET', async () => {
    await app.request(PATH, { method: 'PUT', body: new Uint8Array([9, 9, 9]) }, env);

    // Age the stored object beyond the logical TTL.
    const entry = bucket.store.get(`${GROUP}/${KEY}`)!;
    entry.customMetadata = { uploadedAt: String(Date.now() - BLOB_TTL_MS - 1000) };

    const get = await app.request(PATH, {}, env);
    expect(get.status).toBe(404);
    expect(bucket.store.has(`${GROUP}/${KEY}`)).toBe(false);
  });

  it('sweep deletes expired blobs but keeps fresh ones', async () => {
    await app.request(PATH, { method: 'PUT', body: new Uint8Array([1]) }, env);
    await app.request(`/blob/${GROUP}/freshkey123456789`, { method: 'PUT', body: new Uint8Array([2]) }, env);

    // Age only the first object past the TTL.
    bucket.store.get(`${GROUP}/${KEY}`)!.customMetadata = {
      uploadedAt: String(Date.now() - BLOB_TTL_MS - 1000),
    };

    const deleted = await sweepExpiredBlobs(bucket as unknown as R2Bucket);
    expect(deleted).toBe(1);
    expect(bucket.store.has(`${GROUP}/${KEY}`)).toBe(false);
    expect(bucket.store.has(`${GROUP}/freshkey123456789`)).toBe(true);
  });
});
