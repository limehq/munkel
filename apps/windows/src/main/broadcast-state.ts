import type { StateUpdate } from '../shared/types';
import { PUSH_CHANNELS } from '../shared/ipc-channels';

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
	targets.menu?.send(PUSH_CHANNELS.STATE_UPDATE, update);
	targets.palette?.send(PUSH_CHANNELS.STATE_UPDATE, update);
	targets.notch?.send(PUSH_CHANNELS.STATE_UPDATE, update);
}
