import { describe, it, expect } from 'bun:test';
import {
	blobBaseUrl,
	generateBlobKey,
	uploadBlob,
	MAX_BLOB_BYTES,
} from '../blob-upload';

describe('blobBaseUrl', () => {
	it('strips /ws path and swaps ws → http', () => {
		expect(blobBaseUrl('ws://relay.example/ws?group=g&member=m')).toBe(
			'http://relay.example/',
		);
	});
	it('swaps wss → https and preserves port', () => {
		expect(blobBaseUrl('wss://relay.example:8787/ws?group=g&member=m')).toBe(
			'https://relay.example:8787/',
		);
	});
	it('preserves the trailing path that is NOT /ws', () => {
		expect(blobBaseUrl('wss://host:8787/relay/')).toBe('https://host:8787/relay/');
	});
	it('handles a relay URL with no path at all', () => {
		expect(blobBaseUrl('ws://127.0.0.1:8787')).toBe('http://127.0.0.1:8787/');
	});
	it('throws on http(s) URLs', () => {
		expect(() => blobBaseUrl('http://relay.example')).toThrow(/ws/);
		expect(() => blobBaseUrl('https://relay.example')).toThrow(/ws/);
	});
	it('throws on URLs with credentials', () => {
		expect(() => blobBaseUrl('wss://user:pass@relay.example/ws')).toThrow(
			/credentials/,
		);
	});
});

describe('generateBlobKey', () => {
	it('produces a URL-safe key of expected length', () => {
		const k = generateBlobKey();
		expect(k).toMatch(/^[A-Za-z0-9_-]+$/);
		// 24 bytes → 32 base64url chars.
		expect(k.length).toBe(32);
	});
	it('produces distinct keys across calls', () => {
		const keys = new Set(Array.from({ length: 32 }, () => generateBlobKey()));
		expect(keys.size).toBe(32);
	});
});

describe('uploadBlob', () => {
	function mockFetch(responder: (url: string, init: RequestInit) => Promise<Response> | Response): typeof fetch {
		return (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input.toString();
			return responder(url, init ?? {});
		}) as typeof fetch;
	}

	function mockResponse(status: number, body = ''): Response {
		return new Response(body, { status, statusText: status === 204 ? 'No Content' : 'Error' });
	}

	it('PUTs to <base>/blob/<group>/<key> with octet-stream body', async () => {
		let captured: { url: string; method: string; body: Uint8Array; contentType: string } | null = null;
		const fetchImpl = mockFetch(async (url, init) => {
			const body = init.body as Uint8Array;
			captured = {
				url,
				method: init.method ?? 'GET',
				body,
				contentType: (init.headers as Record<string, string> | undefined)?.['content-type'] ?? '',
			};
			return mockResponse(204);
		});

		const body = new Uint8Array([1, 2, 3, 4]);
		const result = await uploadBlob('ws://relay/ws?group=g&member=m', 'gid1234', 'keyabcd', body, fetchImpl);
		expect(result.ok).toBe(true);
		expect(result.status).toBe(204);
		expect(captured).not.toBeNull();
		expect(captured!.url).toBe('http://relay/blob/gid1234/keyabcd');
		expect(captured!.method).toBe('PUT');
		expect(Array.from(captured!.body)).toEqual([1, 2, 3, 4]);
		expect(captured!.contentType).toBe('application/octet-stream');
	});

	it('returns ok:false on 413 with the server message', async () => {
		const fetchImpl = mockFetch(async () => mockResponse(413, 'Payload too large'));
		const result = await uploadBlob('ws://relay/ws', 'gid', 'key', new Uint8Array([1]), fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(413);
		expect(result.error).toMatch(/Payload too large/);
	});

	it('returns ok:false on non-2xx with the status text', async () => {
		const fetchImpl = mockFetch(async () => mockResponse(500, 'boom'));
		const result = await uploadBlob('ws://relay/ws', 'gid', 'key', new Uint8Array([1]), fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.status).toBe(500);
		expect(result.error).toMatch(/500/);
	});

	it('returns ok:false on network error', async () => {
		const fetchImpl = mockFetch(async () => {
			throw new Error('ECONNREFUSED');
		});
		const result = await uploadBlob('ws://relay/ws', 'gid', 'key', new Uint8Array([1]), fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/ECONNREFUSED/);
	});

	it('returns ok:false on empty body', async () => {
		const fetchImpl = mockFetch(async () => mockResponse(204));
		const result = await uploadBlob('ws://relay/ws', 'gid', 'key', new Uint8Array(0), fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/Empty/);
	});

	it('returns ok:false when body exceeds MAX_BLOB_BYTES', async () => {
		const fetchImpl = mockFetch(async () => mockResponse(204));
		const big = new Uint8Array(MAX_BLOB_BYTES + 1);
		const result = await uploadBlob('ws://relay/ws', 'gid', 'key', big, fetchImpl);
		expect(result.ok).toBe(false);
		expect(result.error).toMatch(/too large/);
	});
});