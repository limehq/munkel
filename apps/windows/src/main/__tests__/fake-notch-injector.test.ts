import { describe, expect, it } from 'bun:test';
import {
	createFakeNotchInjector,
	createFakeNotchMessage,
	type Rng,
	type ScheduleFn,
} from '../fake-notch-injector';
import type { NotchMessage } from '../../shared/types';

function seededRng(values: number[]): Rng {
	let i = 0;
	return () => {
		const v = values[i % values.length]!;
		i += 1;
		return v;
	};
}

describe('createFakeNotchMessage', () => {
	it('returns all required NotchMessage fields without images', () => {
		const msg = createFakeNotchMessage(() => 0);

		expect(msg.sender).toBeTruthy();
		expect(typeof msg.senderMemberId).toBe('string');
		expect(msg.senderMemberId!.length).toBeGreaterThan(0);
		expect(msg.text).toBeTruthy();
		expect(msg.isDirect).toBe(false);
		expect(msg.group).toBe('dev-fake');
		expect(msg.groupColor).toMatch(/^#[0-9a-f]{6}$/i);
		expect(msg.images).toBeUndefined();
		expect('images' in msg && msg.images !== undefined).toBe(false);
	});

	it('sets receivedAt to a valid ISO-8601 timestamp', () => {
		const msg = createFakeNotchMessage(() => 0);
		expect(Number.isNaN(Date.parse(msg.receivedAt))).toBe(false);
		expect(msg.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});

describe('createFakeNotchInjector', () => {
	it('calls inject after the scheduled delay on start', () => {
		const injected: NotchMessage[] = [];
		const scheduled: Array<{ fn: () => void; ms: number }> = [];
		const schedule: ScheduleFn = (fn, ms) => {
			scheduled.push({ fn, ms });
			return scheduled.length as unknown as ReturnType<typeof setTimeout>;
		};
		const cleared: unknown[] = [];

		const injector = createFakeNotchInjector({
			inject: (m) => injected.push(m),
			random: seededRng([0, 0, 0, 0]),
			schedule,
			clearSchedule: (id) => cleared.push(id),
			uuid: () => 'test-uuid',
			nowIso: () => '2026-07-20T12:00:00.000Z',
		});

		expect(injector.isRunning()).toBe(false);
		injector.start();
		expect(injector.isRunning()).toBe(true);
		expect(scheduled).toHaveLength(1);
		expect(scheduled[0]!.ms).toBeGreaterThanOrEqual(5_000);
		expect(scheduled[0]!.ms).toBeLessThanOrEqual(10_000);
		expect(injected).toHaveLength(0);

		scheduled[0]!.fn();
		expect(injected).toHaveLength(1);
		expect(injected[0]!.senderMemberId).toBe('test-uuid');
		expect(injected[0]!.group).toBe('dev-fake');
		expect(injected[0]!.images).toBeUndefined();
		// Next tick scheduled recursively
		expect(scheduled).toHaveLength(2);
	});

	it('stop clears the pending timeout and prevents further injects', () => {
		const injected: NotchMessage[] = [];
		const scheduled: Array<{ fn: () => void; ms: number }> = [];
		const cleared: unknown[] = [];
		const schedule: ScheduleFn = (fn, ms) => {
			scheduled.push({ fn, ms });
			return scheduled.length as unknown as ReturnType<typeof setTimeout>;
		};

		const injector = createFakeNotchInjector({
			inject: (m) => injected.push(m),
			random: () => 0,
			schedule,
			clearSchedule: (id) => cleared.push(id),
		});

		injector.start();
		expect(scheduled).toHaveLength(1);
		injector.stop();
		expect(injector.isRunning()).toBe(false);
		expect(cleared).toHaveLength(1);

		// Firing a stale callback must not inject or reschedule
		scheduled[0]!.fn();
		expect(injected).toHaveLength(0);
		expect(scheduled).toHaveLength(1);
	});

	it('double-start is a no-op (no second timer)', () => {
		const scheduled: Array<{ fn: () => void; ms: number }> = [];
		const schedule: ScheduleFn = (fn, ms) => {
			scheduled.push({ fn, ms });
			return scheduled.length as unknown as ReturnType<typeof setTimeout>;
		};

		const injector = createFakeNotchInjector({
			inject: () => {},
			random: () => 0,
			schedule,
			clearSchedule: () => {},
		});

		injector.start();
		injector.start();
		expect(scheduled).toHaveLength(1);
	});

	it('dispose stops and refuses further starts', () => {
		const injected: NotchMessage[] = [];
		const scheduled: Array<{ fn: () => void; ms: number }> = [];
		const cleared: unknown[] = [];
		const schedule: ScheduleFn = (fn, ms) => {
			scheduled.push({ fn, ms });
			return scheduled.length as unknown as ReturnType<typeof setTimeout>;
		};

		const injector = createFakeNotchInjector({
			inject: (m) => injected.push(m),
			random: () => 0,
			schedule,
			clearSchedule: (id) => cleared.push(id),
		});

		injector.start();
		injector.dispose();
		expect(injector.isRunning()).toBe(false);
		expect(cleared).toHaveLength(1);

		injector.start();
		expect(injector.isRunning()).toBe(false);
		expect(scheduled).toHaveLength(1);
		expect(injected).toHaveLength(0);
	});
});
