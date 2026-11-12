import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityStore, type CircleCodeCodec } from '../identity-store';
import { createSafeStorageCodec } from '../safe-storage-codec';

const CODE_A = 'alpha-secret-code-111';
const CODE_B = 'bravo-secret-code-222';
const CODE_C = 'charlie-secret-code-333';

function fakeCodec(options?: { available?: boolean; rejectPrefix?: string }): CircleCodeCodec {
	const available = options?.available ?? true;
	return {
		isAvailable: () => available,
		encrypt: (plain) => (available ? Buffer.from(`enc:${plain.split('').reverse().join('')}`).toString('base64') : null),
		decrypt: (stored) => {
			const text = Buffer.from(stored, 'base64').toString('utf8');
			if (!text.startsWith('enc:')) return null;
			const plain = text.slice(4).split('').reverse().join('');
			return options?.rejectPrefix && plain.startsWith(options.rejectPrefix) ? null : plain;
		},
	};
}

describe('IdentityStore circle code encryption at rest', () => {
	let dir: string;
	let file: string;
	let warn: ReturnType<typeof spyOn>;
	let errorSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-enc-'));
		file = path.join(dir, 'state.json');
		warn = spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
		errorSpy.mockRestore();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	function logged(): string {
		return [...warn.mock.calls, ...errorSpy.mock.calls].map((c) => c.map(String).join(' ')).join('\n');
	}

	it('round-trips codes and writes no plaintext code to disk', () => {
		const store = new IdentityStore(dir, fakeCodec());
		store.addCircle(CODE_A, 'wss://relay.example');
		const raw = fs.readFileSync(file, 'utf8');
		expect(raw).not.toContain(CODE_A);
		const onDisk = JSON.parse(raw);
		expect(onDisk.version).toBe(3);
		expect(typeof onDisk.circles[0].codeEnc).toBe('string');
		expect(onDisk.circles[0].code).toBeUndefined();
		const loaded = new IdentityStore(dir, fakeCodec()).load();
		expect(loaded.circles[0]?.code).toBe(CODE_A);
		expect(loaded.circles[0]?.relayUrl).toBe('wss://relay.example');
	});

	it('migrates a plaintext v2 file to encrypted without losing circles', () => {
		fs.writeFileSync(
			file,
			JSON.stringify({
				version: 2,
				memberId: 'm-1',
				displayName: 'Old',
				presenceStatus: 'online',
				circles: [
					{ code: CODE_A, relayUrl: 'wss://r1', joinedAt: '2026-01-01T00:00:00.000Z' },
					{ code: CODE_B, relayUrl: 'wss://r2', joinedAt: '2026-01-02T00:00:00.000Z' },
				],
			}),
		);
		const loaded = new IdentityStore(dir, fakeCodec()).load();
		expect(loaded.circles.map((c) => c.code)).toEqual([CODE_A, CODE_B]);
		const raw = fs.readFileSync(file, 'utf8');
		expect(raw).not.toContain(CODE_A);
		expect(raw).not.toContain(CODE_B);
		expect(JSON.parse(raw).version).toBe(3);
		expect(new IdentityStore(dir, fakeCodec()).load().circles.map((c) => c.code)).toEqual([CODE_A, CODE_B]);
	});

	it('migrates plaintext entries of a v3 file written while the codec was unavailable', () => {
		new IdentityStore(dir, fakeCodec({ available: false })).addCircle(CODE_A, 'wss://r1');
		expect(fs.readFileSync(file, 'utf8')).toContain(CODE_A);
		new IdentityStore(dir, fakeCodec()).load();
		expect(fs.readFileSync(file, 'utf8')).not.toContain(CODE_A);
	});

	it('skips an undecryptable circle, keeps the others and preserves it on disk', () => {
		new IdentityStore(dir, fakeCodec()).addCircle(CODE_A, 'wss://r1');
		new IdentityStore(dir, fakeCodec()).addCircle(CODE_B, 'wss://r2');
		new IdentityStore(dir, fakeCodec()).addCircle(CODE_C, 'wss://r3');
		const store = new IdentityStore(dir, fakeCodec({ rejectPrefix: 'bravo' }));
		const loaded = store.load();
		expect(loaded.circles.map((c) => c.code)).toEqual([CODE_A, CODE_C]);
		expect(loaded.memberId).toBeTruthy();
		store.patch({ displayName: 'Changed' });
		const again = new IdentityStore(dir, fakeCodec()).load();
		expect(again.displayName).toBe('Changed');
		expect(again.circles.map((c) => c.code).sort()).toEqual([CODE_A, CODE_B, CODE_C]);
	});

	it('does not reset the whole state when decryption throws and logs no code values', () => {
		const first = new IdentityStore(dir, fakeCodec());
		first.patch({ displayName: 'Keep Me' });
		first.addCircle(CODE_A, 'wss://r1');
		const throwing: CircleCodeCodec = {
			isAvailable: () => true,
			encrypt: () => null,
			decrypt: () => {
				throw new Error(`boom ${CODE_A}`);
			},
		};
		const loaded = new IdentityStore(dir, throwing).load();
		expect(loaded.displayName).toBe('Keep Me');
		expect(loaded.circles).toHaveLength(0);
		expect(logged()).not.toContain(CODE_A);
	});

	it('warns without code values and keeps entries when no codec is available', () => {
		const store = new IdentityStore(dir, fakeCodec({ available: false }));
		store.addCircle(CODE_A, 'wss://r1');
		expect(warn).toHaveBeenCalled();
		expect(logged()).not.toContain(CODE_A);
		expect(new IdentityStore(dir, fakeCodec({ available: false })).load().circles[0]?.code).toBe(CODE_A);
	});

	it('does not drop encrypted circles when the codec is unavailable', () => {
		new IdentityStore(dir, fakeCodec()).addCircle(CODE_A, 'wss://r1');
		const store = new IdentityStore(dir, fakeCodec({ available: false }));
		expect(store.load().circles).toHaveLength(0);
		store.patch({ displayName: 'X' });
		expect(new IdentityStore(dir, fakeCodec()).load().circles[0]?.code).toBe(CODE_A);
	});
});

describe('IdentityStore write safety', () => {
	let dir: string;
	let file: string;
	let warn: ReturnType<typeof spyOn>;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-write-'));
		file = path.join(dir, 'state.json');
		warn = spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('keeps an existing encrypted entry when re-encryption fails while available', () => {
		new IdentityStore(dir, fakeCodec()).addCircle(CODE_A, 'wss://r1');
		const base = fakeCodec();
		const failing: CircleCodeCodec = { ...base, encrypt: () => null };
		new IdentityStore(dir, failing).patch({ displayName: 'Changed' });
		const raw = fs.readFileSync(file, 'utf8');
		expect(raw).not.toContain(CODE_A);
		expect(new IdentityStore(dir, fakeCodec()).load().circles[0]?.code).toBe(CODE_A);
	});

	it('keeps an existing encrypted entry when encrypt throws', () => {
		new IdentityStore(dir, fakeCodec()).addCircle(CODE_A, 'wss://r1');
		const base = fakeCodec();
		const throwing: CircleCodeCodec = {
			...base,
			encrypt: () => {
				throw new Error('boom');
			},
		};
		new IdentityStore(dir, throwing).patch({ displayName: 'Changed' });
		expect(fs.readFileSync(file, 'utf8')).not.toContain(CODE_A);
	});

	it('leaves the old file intact and no temp file behind when the write fails', () => {
		const store = new IdentityStore(dir, fakeCodec());
		store.addCircle(CODE_A, 'wss://r1');
		const before = fs.readFileSync(file, 'utf8');
		const rename = spyOn(fs, 'renameSync').mockImplementation(() => {
			throw new Error('disk full');
		});
		try {
			expect(() => store.patch({ displayName: 'Lost' })).toThrow('disk full');
		} finally {
			rename.mockRestore();
		}
		expect(fs.readFileSync(file, 'utf8')).toBe(before);
		expect(fs.readdirSync(dir)).toEqual(['state.json']);
	});

	it('writes via a temp file that never contains a plaintext code', () => {
		const store = new IdentityStore(dir, fakeCodec());
		const seen: string[] = [];
		const original = fs.renameSync;
		const rename = spyOn(fs, 'renameSync').mockImplementation(((from: fs.PathLike, to: fs.PathLike) => {
			seen.push(fs.readFileSync(from, 'utf8'));
			original(from, to);
		}) as typeof fs.renameSync);
		try {
			store.addCircle(CODE_A, 'wss://r1');
		} finally {
			rename.mockRestore();
		}
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.join('|')).not.toContain(CODE_A);
	});
});

describe('createSafeStorageCodec', () => {
	it('maps safeStorage to the codec and swallows errors', () => {
		const fake = {
			isEncryptionAvailable: () => true,
			encryptString: (s: string) => Buffer.from(`x${s}`),
			decryptString: (b: Buffer) => {
				const t = b.toString();
				if (!t.startsWith('x')) throw new Error('bad');
				return t.slice(1);
			},
		};
		const codec = createSafeStorageCodec(fake);
		expect(codec.isAvailable()).toBe(true);
		const enc = codec.encrypt('abc');
		expect(enc).not.toBeNull();
		expect(codec.decrypt(enc as string)).toBe('abc');
		expect(codec.decrypt(Buffer.from('zzz').toString('base64'))).toBeNull();
	});

	it('reports unavailable and returns null when encryption is unavailable', () => {
		const codec = createSafeStorageCodec({
			isEncryptionAvailable: () => false,
			encryptString: () => {
				throw new Error('no');
			},
			decryptString: () => '',
		});
		expect(codec.isAvailable()).toBe(false);
		expect(codec.encrypt('abc')).toBeNull();
	});
});
