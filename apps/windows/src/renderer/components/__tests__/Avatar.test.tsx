import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { Avatar, AVATAR_PULSE_DURATION_MS } from '../Avatar';
import { FakeTimers } from '../../../test-support/fake-timers';

function avatarDiv(root: ReturnType<typeof create>) {
	return root.root.findAllByType('div')[0];
}

describe('Avatar entry animation + pulse (Plan 12 P3.5)', () => {
	let timers: FakeTimers;

	beforeEach(() => {
		timers = new FakeTimers();
		timers.install();
	});

	afterEach(() => {
		timers.restore();
	});

	it('never has the avatar-pulse class when pulse is not requested', async () => {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Avatar name="Alice" />);
		});

		expect(avatarDiv(root!).props.className).toBe('avatar');

		await act(async () => {
			root!.unmount();
		});
	});

	it('applies the avatar-pulse class immediately when pulse=true at mount', async () => {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Avatar name="Alice" pulse />);
		});

		expect(avatarDiv(root!).props.className).toBe('avatar avatar-pulse');

		await act(async () => {
			root!.unmount();
		});
	});

	it('removes the avatar-pulse class after the pulse duration elapses', async () => {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Avatar name="Alice" pulse />);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar avatar-pulse');

		await act(async () => {
			timers.advance(AVATAR_PULSE_DURATION_MS);
		});

		expect(avatarDiv(root!).props.className).toBe('avatar');

		await act(async () => {
			root!.unmount();
		});
	});

	it('does not re-trigger the pulse on a re-render that still passes pulse=true (mount-only)', async () => {
		function Wrapper({ pulse }: { pulse: boolean }) {
			return <Avatar name="Alice" pulse={pulse} />;
		}

		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Wrapper pulse />);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar avatar-pulse');

		await act(async () => {
			timers.advance(AVATAR_PULSE_DURATION_MS);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar');

		await act(async () => {
			root!.update(<Wrapper pulse />);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar');

		await act(async () => {
			root!.unmount();
		});
	});

	it('cleans up its pending pulse timer on unmount (no state update after unmount)', async () => {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Avatar name="Alice" pulse />);
		});

		await act(async () => {
			root!.unmount();
		});

		timers.advance(AVATAR_PULSE_DURATION_MS);
	});
});
