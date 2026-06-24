import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildControlHandler, type ControlAppState } from '../control-handlers';
import type { CircleState } from '../../shared/types';
import type { ControlRequest, ControlResponse } from '../../core/control';
import type { SendResult } from '../group-session';

function fakeState(opts: {
	circles?: CircleState[];
	sendChat?: (code: string, text: string, to?: string) => Promise<SendResult>;
	sendImages?: (code: string, paths: string[], caption: string, to?: string) => Promise<SendResult>;
}): ControlAppState {
	return {
		getState: () => ({ circles: opts.circles ?? [] }),
		sendChat:
			opts.sendChat ?? (async () => ({ ok: true })),
		sendImages:
			opts.sendImages ?? (async () => ({ ok: true })),
	};
}

function circle(
	code: string,
	members: Array<{ memberId: string; displayName?: string }> = [],
	isConnected = true,
): CircleState {
	return {
		code,
		groupId: `g-${code}`,
		isConnected,
		members: members.map((m) => ({ ...m, joinedAt: '2026-01-01T00:00:00.000Z' })),
		relayUrl: 'wss://relay.example',
	};
}

async function call(
	state: ControlAppState,
	request: ControlRequest,
): Promise<ControlResponse> {
	return buildControlHandler(state)(request);
}

describe('control-handlers', () => {
	describe('groups', () => {
		it('returns an empty list when no circles are joined', async () => {
			const response = await call(fakeState({}), { action: 'groups' });
			expect(response).toEqual({ ok: true, groups: [] });
		});

		it('snapshots each circle with code, connected flag, and member labels', async () => {
			const state = fakeState({
				circles: [
					circle(
						'blue-table-42',
						[
							{ memberId: 'a1', displayName: 'Alex' },
							{ memberId: 'b2' }, // no display name → falls back to memberId
						],
						true,
					),
					circle('kaffee', [{ memberId: 'c3', displayName: 'Chris' }], false),
				],
			});
			const response = await call(state, { action: 'groups' });
			expect(response.ok).toBe(true);
			expect(response.groups).toEqual([
				{ code: 'blue-table-42', connected: true, members: ['Alex', 'b2'] },
				{ code: 'kaffee', connected: false, members: ['Chris'] },
			]);
		});
	});

	describe('send — circle-scoped', () => {
		it('resolves an exact circle code and forwards the text + recipient', async () => {
			let captured: { code: string; text: string; to?: string } | null = null;
			const state = fakeState({
				circles: [circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }])],
				sendChat: async (code, text, to) => {
					captured = { code, text, to };
					return { ok: true };
				},
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				to: 'Alex',
				text: 'deploy is green',
			});
			expect(response).toEqual({ ok: true });
			expect(captured).toEqual({
				code: 'blue-table-42',
				text: 'deploy is green',
				to: 'a1',
			});
		});

		it('accepts a unique circle-code prefix', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42')],
				sendChat: async (code) => {
					expect(code).toBe('blue-table-42');
					return { ok: true };
				},
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table',
				text: 'hi',
			});
			expect(response).toEqual({ ok: true });
		});

		it('rejects an unknown circle', async () => {
			const state = fakeState({ circles: [circle('blue-table-42')] });
			const response = await call(state, {
				action: 'send',
				group: 'kaffee',
				text: 'hi',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toContain('Unknown or ambiguous circle "kaffee"');
		});

		it('rejects an ambiguous circle prefix', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42'), circle('blue-table-99')],
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue',
				text: 'hi',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toContain('Unknown or ambiguous circle "blue"');
		});

		it('maps a missing recipient to a broadcast (no `to` on the wire)', async () => {
			let captured: { to?: string } | null = null;
			const state = fakeState({
				circles: [circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }])],
				sendChat: async (_code, _text, to) => {
					captured = { to };
					return { ok: true };
				},
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				to: 'all',
				text: 'coffee?',
			});
			expect(response).toEqual({ ok: true });
			expect(captured?.to).toBeUndefined();
		});

		it('rejects a recipient that is not online in the circle', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }])],
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				to: 'Sam',
				text: 'hi',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toBe('"Sam" isn\'t online in blue-table-42');
		});

		it('rejects an ambiguous recipient inside the circle', async () => {
			const state = fakeState({
				circles: [
					circle('blue-table-42', [
						{ memberId: 'a1', displayName: 'Alex' },
						{ memberId: 'a2', displayName: 'Alex' },
					]),
				],
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				to: 'Alex',
				text: 'hi',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toBe('"Alex" is ambiguous in blue-table-42');
		});

		it('surfaces sendChat failures as an error envelope', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42')],
				sendChat: async () => ({ ok: false }),
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'hi',
			});
			expect(response).toEqual({
				ok: false,
				error: 'Send failed — no connection to the relay?',
			});
		});

		it('passes through the sendChat error message verbatim when provided', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42')],
				sendChat: async () => ({ ok: false, error: 'Message too long (49500 chars; max 49152).' }),
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: '...'.repeat(15_000),
			});
			expect(response).toEqual({
				ok: false,
				error: 'Message too long (49500 chars; max 49152).',
			});
		});
	});

	describe('send — recipient-only (dm)', () => {
		it('resolves a unique recipient across all circles', async () => {
			let captured: { code: string; to?: string } | null = null;
			const state = fakeState({
				circles: [
					circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }]),
					circle('kaffee', [{ memberId: 'c3', displayName: 'Chris' }]),
				],
				sendChat: async (code, _text, to) => {
					captured = { code, to };
					return { ok: true };
				},
			});
			const response = await call(state, {
				action: 'send',
				to: 'Alex',
				text: 'hey',
			});
			expect(response).toEqual({ ok: true });
			expect(captured).toEqual({ code: 'blue-table-42', to: 'a1' });
		});

		it('reports an ambiguous recipient with the candidate circles', async () => {
			const state = fakeState({
				circles: [
					circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }]),
					circle('kaffee', [{ memberId: 'a2', displayName: 'Alex' }]),
				],
			});
			const response = await call(state, {
				action: 'send',
				to: 'Alex',
				text: 'hey',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toContain('"Alex" is in blue-table-42, kaffee');
			expect(response.groups).toEqual([
				{ code: 'blue-table-42', connected: true, members: ['Alex'] },
				{ code: 'kaffee', connected: true, members: ['Alex'] },
			]);
		});

		it('reports a recipient with no online matches', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }])],
			});
			const response = await call(state, {
				action: 'send',
				to: 'Sam',
				text: 'hey',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toContain('No online member matches "Sam"');
		});

		it('rejects a dm-style broadcast', async () => {
			const state = fakeState({
				circles: [circle('blue-table-42', [{ memberId: 'a1', displayName: 'Alex' }])],
			});
			const response = await call(state, {
				action: 'send',
				to: 'all',
				text: 'hi',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toContain('Broadcast needs a circle');
		});
	});

	describe('send — image', () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await mkdtemp(join(tmpdir(), 'munkel-control-handlers-'));
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		async function makeFile(name: string, size = 0): Promise<string> {
			const path = join(tempDir, name);
			if (size > 0) {
				await writeFile(path, Buffer.alloc(size));
			} else {
				await writeFile(path, '');
			}
			return path;
		}

		it('routes imagePaths to sendImages with the caption as text', async () => {
			let captured: { group: string; paths: string[]; caption: string; to?: string } | null = null;
			const state = fakeState({
				sendImages: async (group, paths, caption, to) => {
					captured = { group, paths, caption, to };
					return { ok: true };
				},
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'look at this',
				imagePaths: [await makeFile('a.png'), await makeFile('b.png')],
				to: 'Alice',
			});
			expect(response).toEqual({ ok: true });
			expect(captured).toBeTruthy();
			expect(captured!.group).toBe('blue-table-42');
			expect(captured!.paths).toHaveLength(2);
			expect(captured!.caption).toBe('look at this');
			expect(captured!.to).toBe('Alice');
		});

		it('rejects an image send without a circle code', async () => {
			const state = fakeState({});
			const response = await call(state, {
				action: 'send',
				text: 'caption',
				imagePaths: [await makeFile('a.png')],
			});
			expect(response.ok).toBe(false);
			expect(response.error).toMatch(/Image sends need a circle/);
		});

		it('rejects a missing image file', async () => {
			const state = fakeState({});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'caption',
				imagePaths: [join(tempDir, 'does-not-exist.png')],
			});
			expect(response.ok).toBe(false);
			expect(response.error).toMatch(/File not found/);
		});

		it('rejects unsupported image formats', async () => {
			const txtPath = await makeFile('notes.txt');
			const state = fakeState({});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'caption',
				imagePaths: [txtPath],
			});
			expect(response.ok).toBe(false);
			expect(response.error).toMatch(/Unsupported image format/);
			expect(response.error).toContain('notes.txt');
		});

		it('rejects image files larger than the maximum size', async () => {
			const bigPath = await makeFile('huge.png', 51 * 1024 * 1024);
			const state = fakeState({});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'caption',
				imagePaths: [bigPath],
			});
			expect(response.ok).toBe(false);
			expect(response.error).toMatch(/File too large/);
			expect(response.error).toContain('huge.png');
		});

		it('rejects more than 8 images', async () => {
			const paths = await Promise.all(
				Array.from({ length: 9 }, (_, i) => makeFile(`img${i}.png`)),
			);
			const state = fakeState({});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'caption',
				imagePaths: paths,
			});
			expect(response.ok).toBe(false);
			expect(response.error).toMatch(/Too many images/);
		});

		it('passes through sendImages errors verbatim', async () => {
			const state = fakeState({
				sendImages: async () => ({
					ok: false,
					error: 'Could not encode C:/tmp/a.png',
				}),
			});
			const response = await call(state, {
				action: 'send',
				group: 'blue-table-42',
				text: 'caption',
				imagePaths: [await makeFile('a.png')],
			});
			expect(response).toEqual({
				ok: false,
				error: 'Could not encode C:/tmp/a.png',
			});
		});
	});

	describe('send — generic', () => {
		it('rejects an empty message', async () => {
			const response = await call(fakeState({}), {
				action: 'send',
				group: 'blue-table-42',
				text: '',
			});
			expect(response.ok).toBe(false);
			expect(response.error).toBe('Empty message');
		});
	});

	it('rejects unknown actions', async () => {
		const response = await call(fakeState({}), { action: 'whatever' });
		expect(response).toEqual({ ok: false, error: 'Unknown action "whatever"' });
	});
});
