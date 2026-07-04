import { describe, expect, it } from 'bun:test';
import { broadcastStateUpdate } from '../broadcast-state';
import type { StateUpdate } from '../../shared/types';

function mockTarget() {
	const sends: { channel: string; payload: unknown }[] = [];
	return {
		sends,
		send(channel: string, payload: unknown) {
			sends.push({ channel, payload });
		},
	};
}

const sampleUpdate: StateUpdate = {
	identity: { memberId: 'me', displayName: 'Me' },
	circles: [],
};

describe('broadcastStateUpdate', () => {
	it('reaches menu, palette, and notch windows', () => {
		const menu = mockTarget();
		const palette = mockTarget();
		const notch = mockTarget();

		broadcastStateUpdate(sampleUpdate, { menu, palette, notch });

		expect(menu.sends).toEqual([{ channel: 'state-update', payload: sampleUpdate }]);
		expect(palette.sends).toEqual([{ channel: 'state-update', payload: sampleUpdate }]);
		expect(notch.sends).toEqual([{ channel: 'state-update', payload: sampleUpdate }]);
	});

	it('skips null targets', () => {
		const menu = mockTarget();
		broadcastStateUpdate(sampleUpdate, { menu, palette: null, notch: null });
		expect(menu.sends).toHaveLength(1);
	});
});
