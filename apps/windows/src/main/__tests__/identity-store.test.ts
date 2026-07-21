import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IdentityStore, type PersistedState } from '../identity-store';

describe('identity-store', () => {
	let tempDir: string;
	let store: IdentityStore;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'munkel-identity-store-'));
		store = new IdentityStore(tempDir);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it('saves state.json with restricted permissions on POSIX', async () => {
		const state: PersistedState = {
			version: 1,
			memberId: 'member-123',
			displayName: 'Test User',
			circles: [],
		};

		store.save(state);

		const filePath = join(tempDir, 'state.json');
		const raw = await readFile(filePath, 'utf8');
		expect(JSON.parse(raw)).toEqual(state);

		if (process.platform !== 'win32') {
			const info = await stat(filePath);
			expect(info.mode & 0o777).toBe(0o600);
		}
	});

	it('round-trips persisted state', () => {
		const state: PersistedState = {
			version: 1,
			memberId: 'member-456',
			displayName: 'Round Trip',
			githubLogin: 'roundtrip',
			circles: [
				{
					code: 'blue-table-42',
					relayUrl: 'wss://relay.example',
					joinedAt: '2026-01-01T00:00:00.000Z',
				},
			],
		};

		store.save(state);
		expect(store.load()).toEqual(state);
	});
});
