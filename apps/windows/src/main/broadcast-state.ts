import type { StateUpdate } from '../shared/types';

export type StatePushTarget = {
	send(channel: string, payload: unknown): void;
};

/** Push `state-update` to every renderer window that needs circle/identity state. */
export function broadcastStateUpdate(
	update: StateUpdate,
	targets: {
		menu?: StatePushTarget | null;
		palette?: StatePushTarget | null;
		notch?: StatePushTarget | null;
	},
): void {
	targets.menu?.send('state-update', update);
	targets.palette?.send('state-update', update);
	targets.notch?.send('state-update', update);
}
