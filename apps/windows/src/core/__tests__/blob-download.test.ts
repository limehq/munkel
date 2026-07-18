import { describe, it, expect } from 'bun:test';
import { MAX_BLOB_BYTES } from '@munkel/shared-wire/wire-constants';
import { downloadBlob } from '../blob-download';

describe('downloadBlob', () => {
	function mockFetch(responder: (url: string, init: RequestInit) => Promise<Response> | Response): typeof fetch {
		return (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			return responder(url, init ?? {});
		}) as typeof fetch;
	}

	it('GETs <base>/blob/<group>/<key> and returns the body', async () => {
		let captured: { url: string; method: string } | null = null;
		const payload = new Uint8Array([9, 8, 7, 6]);
		const fetchImpl = mockFetch(async (url, init) => {
			captured = { url, method: init.method ?? 'GET' };
			return new Response(payload, { status: 200 });
		});

		const result = await downloadBlob(
			'ws://relay/ws?group=g&member=m',
			'gid1234',
			'keyabcd',
			MAX_BLOB_BYTES,
			fetchImpl,
		);
		expect(result.ok).toBe(true);
		expect(result.status).toBe(200);
		expect(Array.from(result.body!)).toEqual([9, 8, 7, 6]);
		expect(captured).toEqual({
			url: 'http://relay/blob/gid1234/keyabcd',
			method: 'GET',
		});
	});

	it('returns ok:false on 404', async () => {
		const fetchImpl = mockFetch(async () => new Response('Not found', { status: 404 }));
		const result = await downloadBlob('ws://relay/ws', 'gid', 'key', MAX_BLOB_BYTES, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(404);
		expect(result.error).toMatch(/404/);
	});

	it('returns ok:false on network error', async () => {
		const fetchImpl = mockFetch(async () => {
			throw new Error('ECONNREFUSED');
		});
		const result = await downloadBlob('ws://relay/ws', 'gid', 'key', MAX_BLOB_BYTES, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/ECONNREFUSED/);
	});

	it('returns ok:false on empty body', async () => {
		const fetchImpl = mockFetch(async () => new Response(new Uint8Array(0), { status: 200 }));
		const result = await downloadBlob('ws://relay/ws', 'gid', 'key', MAX_BLOB_BYTES, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Empty/);
	});

	it('returns ok:false when body exceeds maxBytes', async () => {
		const fetchImpl = mockFetch(async () => new Response(new Uint8Array(11), { status: 200 }));
		const result = await downloadBlob('ws://relay/ws', 'gid', 'key', 10, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/too large/);
	});

	it('rejects early when Content-Length exceeds maxBytes', async () => {
		let readBody = false;
		const fetchImpl = mockFetch(async () => {
			const res = new Response(new Uint8Array(100), {
				status: 200,
				headers: { 'content-length': '999999' },
			});
			const orig = res.arrayBuffer.bind(res);
			res.arrayBuffer = async () => {
				readBody = true;
				return orig();
			};
			return res;
		});
		const result = await downloadBlob('ws://relay/ws', 'gid', 'key', 100, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/declared/);
		expect(readBody).toBe(false);
	});

	it('returns ok:false for missing ids', async () => {
		const fetchImpl = mockFetch(async () => new Response(new Uint8Array([1]), { status: 200 }));
		expect((await downloadBlob('ws://relay/ws', '', 'key', MAX_BLOB_BYTES, fetchImpl)).ok).toBe(false);
		expect((await downloadBlob('ws://relay/ws', 'gid', '', MAX_BLOB_BYTES, fetchImpl)).ok).toBe(false);
	});
});
