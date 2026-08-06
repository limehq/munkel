import { randomUUID } from 'node:crypto';
import { getCircleColor } from '../shared/group-color';
import type { NotchMessage } from '../shared/types';

const FAKE_SENDERS = [
	'Alex',
	'Blake',
	'Casey',
	'Drew',
	'Ellis',
	'Finley',
	'Harper',
	'Jordan',
] as const;

const FAKE_BODIES = [
	'ping',
	'on my way',
	'quick check-in',
	'looks good',
	'brb',
	'can you take a look?',
	'shipped',
	'thanks!',
] as const;

const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10_000;

/** Returns a float in [0, 1). */
export type Rng = () => number;

export type ScheduleFn = (fn: () => void, ms: number) => unknown;
export type ClearScheduleFn = (id: unknown) => void;

/**
 * Build a full fake {@link NotchMessage} for DEV notch QA.
 * No images; `isDirect` is always false in v1.
 */
export function createFakeNotchMessage(rng: Rng = Math.random): NotchMessage {
	const sender = FAKE_SENDERS[Math.floor(rng() * FAKE_SENDERS.length)]!;
	const text = FAKE_BODIES[Math.floor(rng() * FAKE_BODIES.length)]!;
	const colorIndex = Math.floor(rng() * 8);

	return {
		sender,
		senderMemberId: randomUUID(),
		text,
		isDirect: false,
		group: 'dev-fake',
		groupColor: getCircleColor(colorIndex),
		receivedAt: new Date().toISOString(),
	};
}

export interface FakeNotchInjectorDeps {
	inject: (message: NotchMessage) => void;
	random?: Rng;
	schedule?: ScheduleFn;
	clearSchedule?: ClearScheduleFn;
	/** Override UUID for `senderMemberId` (factory default uses crypto.randomUUID). */
	uuid?: () => string;
	nowIso?: () => string;
}

export interface FakeNotchInjector {
	start(): void;
	stop(): void;
	dispose(): void;
	isRunning(): boolean;
}

function delayMs(rng: Rng): number {
	return MIN_DELAY_MS + Math.floor(rng() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

function buildMessage(
	rng: Rng,
	uuid: () => string,
	nowIso: () => string,
): NotchMessage {
	const sender = FAKE_SENDERS[Math.floor(rng() * FAKE_SENDERS.length)]!;
	const text = FAKE_BODIES[Math.floor(rng() * FAKE_BODIES.length)]!;
	const colorIndex = Math.floor(rng() * 8);

	return {
		sender,
		senderMemberId: uuid(),
		text,
		isDirect: false,
		group: 'dev-fake',
		groupColor: getCircleColor(colorIndex),
		receivedAt: nowIso(),
	};
}

/**
 * Session-only scheduler that injects fake notch messages every 5–10s (jitter).
 * Uses recursive `setTimeout` (not `setInterval`) so stop clears the pending tick.
 */
export function createFakeNotchInjector(deps: FakeNotchInjectorDeps): FakeNotchInjector {
	const rng = deps.random ?? Math.random;
	const schedule: ScheduleFn = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
	const clearSchedule: ClearScheduleFn =
		deps.clearSchedule ?? ((id) => clearTimeout(id as Parameters<typeof clearTimeout>[0]));
	const uuid = deps.uuid ?? randomUUID;
	const nowIso = deps.nowIso ?? (() => new Date().toISOString());

	let disposed = false;
	let running = false;
	let timerId: unknown = null;

	function clearPending(): void {
		if (timerId !== null) {
			clearSchedule(timerId);
			timerId = null;
		}
	}

	function tick(): void {
		if (!running || disposed) return;
		deps.inject(buildMessage(rng, uuid, nowIso));
		timerId = schedule(tick, delayMs(rng));
	}

	return {
		start() {
			if (disposed || running) return;
			running = true;
			timerId = schedule(tick, delayMs(rng));
		},
		stop() {
			running = false;
			clearPending();
		},
		dispose() {
			disposed = true;
			running = false;
			clearPending();
		},
		isRunning() {
			return running;
		},
	};
}
