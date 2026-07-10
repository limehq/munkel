import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityStore } from '../identity-store';

describe('IdentityStore launchAtLogin (Plan 12 P2.1)', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-store-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('defaults launchAtLogin to false for a freshly created store', () => {
		const store = new IdentityStore(dir);
		const state = store.load();
		expect(state.launchAtLogin).toBe(false);
	});

	it('persists launchAtLogin=true via patch and reflects it on the next load', () => {
		const store = new IdentityStore(dir);
		store.patch({ launchAtLogin: true });

		const reloaded = store.load();
		expect(reloaded.launchAtLogin).toBe(true);
	});

	it('persists launchAtLogin=false via patch after previously being true', () => {
		const store = new IdentityStore(dir);
		store.patch({ launchAtLogin: true });
		store.patch({ launchAtLogin: false });

		expect(store.load().launchAtLogin).toBe(false);
	});

	it('does not disturb other identity fields when patching launchAtLogin', () => {
		const store = new IdentityStore(dir);
		store.patch({ displayName: 'Ada' });
		store.patch({ launchAtLogin: true });

		const state = store.load();
		expect(state.displayName).toBe('Ada');
		expect(state.launchAtLogin).toBe(true);
	});

	it('migrates a legacy state.json (no launchAtLogin field) to default false', () => {
		const filePath = path.join(dir, 'state.json');
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				version: 1,
				memberId: 'legacy-member',
				displayName: 'Legacy',
				circles: [],
			}),
		);

		const store = new IdentityStore(dir);
		const state = store.load();
		expect(state.launchAtLogin).toBe(false);
		expect(state.memberId).toBe('legacy-member');
	});
});
