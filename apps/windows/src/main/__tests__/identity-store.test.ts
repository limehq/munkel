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

describe('IdentityStore autoUpdateCheck (Plan 12 P3.7)', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-store-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('defaults autoUpdateCheck to true for a freshly created store', () => {
		const store = new IdentityStore(dir);
		const state = store.load();
		expect(state.autoUpdateCheck).toBe(true);
	});

	it('persists autoUpdateCheck=false via patch and reflects it on the next load', () => {
		const store = new IdentityStore(dir);
		store.patch({ autoUpdateCheck: false });

		const reloaded = store.load();
		expect(reloaded.autoUpdateCheck).toBe(false);
	});

	it('persists autoUpdateCheck=true via patch after previously being false', () => {
		const store = new IdentityStore(dir);
		store.patch({ autoUpdateCheck: false });
		store.patch({ autoUpdateCheck: true });

		expect(store.load().autoUpdateCheck).toBe(true);
	});

	it('does not disturb other identity fields when patching autoUpdateCheck', () => {
		const store = new IdentityStore(dir);
		store.patch({ displayName: 'Ada' });
		store.patch({ autoUpdateCheck: false });

		const state = store.load();
		expect(state.displayName).toBe('Ada');
		expect(state.autoUpdateCheck).toBe(false);
	});

	it('migrates a legacy state.json (no autoUpdateCheck field) to default true', () => {
		const filePath = path.join(dir, 'state.json');
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				version: 1,
				memberId: 'legacy-member',
				displayName: 'Legacy',
				circles: [],
				launchAtLogin: true,
			}),
		);

		const store = new IdentityStore(dir);
		const state = store.load();
		expect(state.autoUpdateCheck).toBe(true);
		expect(state.launchAtLogin).toBe(true);
		expect(state.memberId).toBe('legacy-member');
	});
});

describe('IdentityStore paletteHotkey (Plan 12 P3.1)', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-store-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('defaults paletteHotkey to Ctrl+Shift+M for a freshly created store', () => {
		const store = new IdentityStore(dir);
		const state = store.load();
		expect(state.paletteHotkey).toBe('Ctrl+Shift+M');
	});

	it('persists a rebound paletteHotkey via patch and reflects it on the next load', () => {
		const store = new IdentityStore(dir);
		store.patch({ paletteHotkey: 'Ctrl+Alt+P' });

		const reloaded = store.load();
		expect(reloaded.paletteHotkey).toBe('Ctrl+Alt+P');
	});

	it('does not disturb other identity fields when patching paletteHotkey', () => {
		const store = new IdentityStore(dir);
		store.patch({ displayName: 'Ada' });
		store.patch({ paletteHotkey: 'Ctrl+Alt+P' });

		const state = store.load();
		expect(state.displayName).toBe('Ada');
		expect(state.paletteHotkey).toBe('Ctrl+Alt+P');
	});

	it('migrates a legacy state.json (no paletteHotkey field) to the default', () => {
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
		expect(state.paletteHotkey).toBe('Ctrl+Shift+M');
		expect(state.memberId).toBe('legacy-member');
	});

	it('resets an invalid/corrupted paletteHotkey value on load to the default', () => {
		const filePath = path.join(dir, 'state.json');
		fs.writeFileSync(
			filePath,
			JSON.stringify({
				version: 1,
				memberId: 'legacy-member',
				displayName: 'Legacy',
				circles: [],
				paletteHotkey: 'not a real accelerator',
			}),
		);

		const store = new IdentityStore(dir);
		const state = store.load();
		expect(state.paletteHotkey).toBe('Ctrl+Shift+M');
	});
});

describe('IdentityStore allowInScreenshots (Plan 13 item 5)', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-store-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('defaults allowInScreenshots to false for a freshly created store', () => {
		const store = new IdentityStore(dir);
		expect(store.load().allowInScreenshots).toBe(false);
	});

	it('persists allowInScreenshots=true via patch and reflects it on the next load', () => {
		const store = new IdentityStore(dir);
		store.patch({ allowInScreenshots: true });

		expect(store.load().allowInScreenshots).toBe(true);
	});

	it('persists allowInScreenshots=false via patch after previously being true', () => {
		const store = new IdentityStore(dir);
		store.patch({ allowInScreenshots: true });
		store.patch({ allowInScreenshots: false });

		expect(store.load().allowInScreenshots).toBe(false);
	});

	it('migrates a legacy state.json (no allowInScreenshots field) to default false', () => {
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
		expect(state.allowInScreenshots).toBe(false);
		expect(state.memberId).toBe('legacy-member');
	});
});

describe('IdentityStore devEchoBroadcasts (Plan 13 item 6)', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'munkel-identity-store-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('defaults devEchoBroadcasts to true for a freshly created store (mirrors macOS DEBUG default)', () => {
		const store = new IdentityStore(dir);
		expect(store.load().devEchoBroadcasts).toBe(true);
	});

	it('persists devEchoBroadcasts=false via patch and reflects it on the next load', () => {
		const store = new IdentityStore(dir);
		store.patch({ devEchoBroadcasts: false });

		expect(store.load().devEchoBroadcasts).toBe(false);
	});

	it('persists devEchoBroadcasts=true via patch after previously being false', () => {
		const store = new IdentityStore(dir);
		store.patch({ devEchoBroadcasts: false });
		store.patch({ devEchoBroadcasts: true });

		expect(store.load().devEchoBroadcasts).toBe(true);
	});

	it('migrates a legacy state.json (no devEchoBroadcasts field) to default true', () => {
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
		expect(state.devEchoBroadcasts).toBe(true);
		expect(state.memberId).toBe('legacy-member');
	});
});
