import { describe, expect, it } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { Avatar } from '../Avatar';

function wait(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function avatarDiv(root: ReturnType<typeof create>) {
	return root.root.findAllByType('div')[0];
}

describe('Avatar entry animation + pulse (Plan 12 P3.5)', () => {
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
			root = create(<Avatar name="Alice" pulse pulseDurationMs={30} />);
		});

		expect(avatarDiv(root!).props.className).toBe('avatar avatar-pulse');

		await act(async () => {
			root!.unmount();
		});
	});

	it('removes the avatar-pulse class after the pulse duration elapses', async () => {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Avatar name="Alice" pulse pulseDurationMs={30} />);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar avatar-pulse');

		await act(async () => {
			await wait(60);
		});

		expect(avatarDiv(root!).props.className).toBe('avatar');

		await act(async () => {
			root!.unmount();
		});
	});

	it('does not re-trigger the pulse on a re-render that still passes pulse=true (mount-only)', async () => {
		function Wrapper({ pulse }: { pulse: boolean }) {
			return <Avatar name="Alice" pulse={pulse} pulseDurationMs={30} />;
		}

		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(<Wrapper pulse />);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar avatar-pulse');

		// Let the pulse finish.
		await act(async () => {
			await wait(60);
		});
		expect(avatarDiv(root!).props.className).toBe('avatar');

		// Re-render the *same* mounted Avatar instance with pulse still true —
		// this must not restart the animation (only a fresh mount should).
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
			root = create(<Avatar name="Alice" pulse pulseDurationMs={30} />);
		});

		await act(async () => {
			root!.unmount();
		});

		// If the timer weren't cleared, this would fire a setState on an
		// unmounted component (React would warn/throw depending on version).
		await wait(60);
	});
});
