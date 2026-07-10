import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { AppProvider } from '../../store/app-store';
import MenuWindow from '../MenuWindow';
import type { StateUpdate, UpdateState } from '../../../shared/types';

function createMockElectronApi(initialState: StateUpdate) {
	let stateUpdateCb: ((update: StateUpdate) => void) | null = null;
	let githubLoginStateCb: ((state: unknown) => void) | null = null;
	let updateStateCb: ((state: UpdateState) => void) | null = null;

	const api = {
		getWindowType: () => Promise.resolve('menu' as const),
		hideWindow: () => Promise.resolve(),
		showPalette: () => Promise.resolve(),
		toggleMenu: () => Promise.resolve(),
		setMenuPickerOpen: (_open: boolean) => Promise.resolve(),
		quitApp: () => Promise.resolve(),
		onGlobalShortcut: (_cb: () => void) => () => {},
		joinCircle: (_code: string, _relayUrl?: string) => Promise.resolve(),
		leaveCircle: (_code: string) => Promise.resolve(),
		sendChat: (_code: string, _text: string, _to?: string) => Promise.resolve({ ok: true }),
		sendImages: (_code: string, _paths: string[], _caption: string, _to?: string) =>
			Promise.resolve({ ok: true }),
		updateProfile: (_displayName: string, _avatar?: string) => Promise.resolve(),
		setRelayUrl: (_code: string, _relayUrl: string) => Promise.resolve(),
		getState: () => Promise.resolve(initialState),
		startGitHubLogin: () => Promise.resolve(),
		cancelGitHubLogin: () => Promise.resolve(),
		githubLogout: () => Promise.resolve(),
		checkForUpdates: () => Promise.resolve(),
		installUpdate: () => Promise.resolve(),
		selectImages: () => Promise.resolve(undefined),
		beginNotchReply: () => Promise.resolve(),
		endNotchReply: () => Promise.resolve(),
		notchSetInteractive: (_interactive: boolean) => Promise.resolve(),
		notchEmpty: () => Promise.resolve(),
		notchResize: (_contentHeight: number) => Promise.resolve(),
		onStateUpdate: (cb: (update: StateUpdate) => void) => {
			stateUpdateCb = cb;
			return () => {
				stateUpdateCb = null;
			};
		},
		onGitHubLoginState: (cb: (state: unknown) => void) => {
			githubLoginStateCb = cb;
			return () => {
				githubLoginStateCb = null;
			};
		},
		onUpdateState: (cb: (state: UpdateState) => void) => {
			updateStateCb = cb;
			return () => {
				updateStateCb = null;
			};
		},
		onNotchMessage: (_cb: unknown) => () => {},
		onRelayError: (_cb: unknown) => () => {},
		onNotchShow: (_cb: unknown) => () => {},
		onNotchHide: (_cb: unknown) => () => {},
		onNotchUpdate: (_cb: unknown) => () => {},
		onNotchReopen: (_cb: unknown) => () => {},

		simulateStateUpdate: (update: StateUpdate) => stateUpdateCb?.(update),
		simulateGitHubLoginState: (state: unknown) => githubLoginStateCb?.(state),
		simulateUpdateState: (state: UpdateState) => updateStateCb?.(state),
	};

	return api;
}

function makeState(circles: StateUpdate['circles']): StateUpdate {
	return {
		identity: { memberId: 'test-member', displayName: 'Test User' },
		circles,
	};
}

describe('MenuWindow circle leave confirmation', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;

	beforeEach(() => {
		electronApi = createMockElectronApi(
			makeState([
				{
					code: 'blue-table-42',
					groupId: 'group-1',
					isConnected: true,
					members: [],
					relayUrl: 'wss://relay.example',
				},
			]),
		);
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = { electronAPI: electronApi };
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
	});

	async function renderMenu() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<MenuWindow />
				</AppProvider>,
			);
			await Promise.resolve();
			await Promise.resolve();
		});
		return root!;
	}

	it('clicking the leave button opens the confirmation dialog without calling leaveCircle', async () => {
		const leaveCircleSpy = spyOn(electronApi, 'leaveCircle');
		const root = await renderMenu();

		const leaveButton = root.root.findByProps({ 'data-testid': 'leave-circle-button' });
		expect(leaveButton).toBeDefined();

		await act(async () => {
			leaveButton.props.onClick();
		});

		expect(leaveCircleSpy).toHaveBeenCalledTimes(0);
		const dialog = root.root.findByProps({ 'data-testid': 'leave-dialog-overlay' });
		expect(dialog).toBeDefined();
	});

	it('clicking Cancel closes the dialog without calling leaveCircle', async () => {
		const leaveCircleSpy = spyOn(electronApi, 'leaveCircle');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const cancelButton = root.root.findByProps({ 'data-testid': 'leave-dialog-cancel' });
		await act(async () => {
			cancelButton.props.onClick();
		});

		expect(leaveCircleSpy).toHaveBeenCalledTimes(0);
		expect(root.root.findAllByProps({ 'data-testid': 'leave-dialog-overlay' }).length).toBe(0);
	});

	it('pressing Escape closes the dialog without calling leaveCircle', async () => {
		const leaveCircleSpy = spyOn(electronApi, 'leaveCircle');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const overlay = root.root.findByProps({ 'data-testid': 'leave-dialog-overlay' });
		await act(async () => {
			overlay.props.onKeyDown({ key: 'Escape', stopPropagation: () => {} });
		});

		expect(leaveCircleSpy).toHaveBeenCalledTimes(0);
		expect(root.root.findAllByProps({ 'data-testid': 'leave-dialog-overlay' }).length).toBe(0);
	});

	it('clicking the backdrop closes the dialog without calling leaveCircle', async () => {
		const leaveCircleSpy = spyOn(electronApi, 'leaveCircle');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const overlay = root.root.findByProps({ 'data-testid': 'leave-dialog-overlay' });
		await act(async () => {
			overlay.props.onClick({ target: overlay, currentTarget: overlay, stopPropagation: () => {} });
		});

		expect(leaveCircleSpy).toHaveBeenCalledTimes(0);
		expect(root.root.findAllByProps({ 'data-testid': 'leave-dialog-overlay' }).length).toBe(0);
	});

	it('clicking Leave calls leaveCircle(code) exactly once and closes the dialog', async () => {
		const leaveCircleSpy = spyOn(electronApi, 'leaveCircle');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const confirmButton = root.root.findByProps({ 'data-testid': 'leave-dialog-confirm' });
		await act(async () => {
			confirmButton.props.onClick();
		});

		expect(leaveCircleSpy).toHaveBeenCalledTimes(1);
		expect(leaveCircleSpy).toHaveBeenCalledWith('blue-table-42');
		expect(root.root.findAllByProps({ 'data-testid': 'leave-dialog-overlay' }).length).toBe(0);
	});

	it('exposes modal ARIA attributes on the dialog', async () => {
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const dialog = root.root.findByProps({ 'data-testid': 'leave-dialog-overlay' });
		expect(dialog).toBeDefined();

		const card = dialog.children.find(
			(child: { props?: { role?: string } }) => child.props?.role === 'dialog',
		);
		expect(card).toBeDefined();
		expect(card.props['aria-modal']).toBe('true');
		expect(card.props['aria-labelledby']).toBeDefined();
		expect(card.props['aria-labelledby']).toContain('leave-dialog-title-');
	});

	it('auto-closes the dialog when the circle is removed from state', async () => {
		const leaveCircleSpy = spyOn(electronApi, 'leaveCircle');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		expect(root.root.findAllByProps({ 'data-testid': 'leave-dialog-overlay' }).length).toBe(1);

		await act(async () => {
			electronApi.simulateStateUpdate(makeState([]));
		});

		expect(leaveCircleSpy).toHaveBeenCalledTimes(0);
		expect(root.root.findAllByProps({ 'data-testid': 'leave-dialog-overlay' }).length).toBe(0);
	});

	it('wraps Tab focus from the last button back to the first', async () => {
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const overlay = root.root.findByProps({ 'data-testid': 'leave-dialog-overlay' });
		const confirmButton = root.root.findByProps({ 'data-testid': 'leave-dialog-confirm' });
		let prevented = false;

		await act(async () => {
			overlay.props.onKeyDown({
				target: confirmButton,
				key: 'Tab',
				shiftKey: false,
				preventDefault: () => {
					prevented = true;
				},
				stopPropagation: () => {},
			});
		});

		expect(prevented).toBe(true);
	});

	it('wraps Shift+Tab focus from the first button back to the last', async () => {
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'leave-circle-button' }).props.onClick();
		});

		const overlay = root.root.findByProps({ 'data-testid': 'leave-dialog-overlay' });
		const cancelButton = root.root.findByProps({ 'data-testid': 'leave-dialog-cancel' });
		let prevented = false;

		await act(async () => {
			overlay.props.onKeyDown({
				target: cancelButton,
				key: 'Tab',
				shiftKey: true,
				preventDefault: () => {
					prevented = true;
				},
				stopPropagation: () => {},
			});
		});

		expect(prevented).toBe(true);
	});
});

describe('MenuWindow settings display-name Enter save (P1.2)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;

	beforeEach(() => {
		electronApi = createMockElectronApi(
			makeState([
				{
					code: 'blue-table-42',
					groupId: 'group-1',
					isConnected: true,
					members: [],
					relayUrl: 'wss://relay.example',
				},
			]),
		);
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = { electronAPI: electronApi };
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
	});

	async function renderMenuWithSettingsOpen() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<MenuWindow />
				</AppProvider>,
			);
			await Promise.resolve();
			await Promise.resolve();
		});

		const settingsButton = root!.root.findByProps({ title: 'Settings' });
		await act(async () => {
			settingsButton.props.onClick({ stopPropagation: () => {} });
		});

		return root!;
	}

	it('pressing Enter in the display-name field commits the new name exactly once', async () => {
		const updateProfileSpy = spyOn(electronApi, 'updateProfile');
		const root = await renderMenuWithSettingsOpen();

		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});

		let prevented = false;
		let blurred = false;
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {
					prevented = true;
				},
				currentTarget: {
					blur: () => {
						blurred = true;
					},
				},
			});
		});

		expect(prevented).toBe(true);
		expect(blurred).toBe(true);
		expect(updateProfileSpy).toHaveBeenCalledTimes(1);
		expect(updateProfileSpy).toHaveBeenCalledWith('New Name', undefined);
	});

	it('a blur that follows the Enter commit does not re-submit the same name', async () => {
		const updateProfileSpy = spyOn(electronApi, 'updateProfile');
		const root = await renderMenuWithSettingsOpen();

		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});

		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});

		// Blur fires as a natural consequence of the Enter-triggered blur() call
		// (or of clicking elsewhere afterward); it must not double-submit.
		await act(async () => {
			input.props.onBlur();
		});

		expect(updateProfileSpy).toHaveBeenCalledTimes(1);
		expect(updateProfileSpy).toHaveBeenCalledWith('New Name', undefined);
	});

	it('does not call updateProfile when Enter is pressed without changing the name', async () => {
		const updateProfileSpy = spyOn(electronApi, 'updateProfile');
		const root = await renderMenuWithSettingsOpen();

		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});

		expect(updateProfileSpy).toHaveBeenCalledTimes(0);
	});

	it('does not call updateProfile when Enter is pressed with a whitespace-only name', async () => {
		const updateProfileSpy = spyOn(electronApi, 'updateProfile');
		const root = await renderMenuWithSettingsOpen();

		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: '   ' } });
		});

		let prevented = false;
		let blurred = false;
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {
					prevented = true;
				},
				currentTarget: {
					blur: () => {
						blurred = true;
					},
				},
			});
		});

		// The keydown handler still prevents default and blurs (matching
		// macOS Enter behavior) even though the trimmed name is empty and
		// therefore never reaches updateProfile.
		expect(prevented).toBe(true);
		expect(blurred).toBe(true);
		expect(updateProfileSpy).toHaveBeenCalledTimes(0);
	});

	it('ignores non-Enter keys in the display-name field', async () => {
		const updateProfileSpy = spyOn(electronApi, 'updateProfile');
		const root = await renderMenuWithSettingsOpen();

		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});

		let prevented = false;
		await act(async () => {
			input.props.onKeyDown({
				key: 'a',
				preventDefault: () => {
					prevented = true;
				},
				currentTarget: { blur: () => {} },
			});
		});

		expect(prevented).toBe(false);
		expect(updateProfileSpy).toHaveBeenCalledTimes(0);
	});

	// Regression test for a MAJOR review finding: updateName() used to set
	// lastSavedNameRef.current = name *before* the `void updateProfile(name)`
	// promise settled. If the IPC call rejected (relay/main-process error),
	// the ref was already updated to the failed name, so a later retry with
	// the same text was treated as "unchanged" and silently dropped. Fixed by
	// only committing the ref inside updateProfile(name).then(...).
	it('retries the same name after a failed updateProfile instead of silently dropping it', async () => {
		let rejectNext = true;
		const failingUpdateProfile = (_name: string) =>
			rejectNext ? Promise.reject(new Error('relay offline')) : Promise.resolve();
		electronApi.updateProfile = failingUpdateProfile;
		const updateProfileSpy = spyOn(electronApi, 'updateProfile');
		const root = await renderMenuWithSettingsOpen();

		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});

		// First Enter: the IPC call rejects.
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
			await Promise.resolve().catch(() => {});
		});

		expect(updateProfileSpy).toHaveBeenCalledTimes(1);

		// Second Enter with the *same* unchanged text should retry, since the
		// first attempt never actually succeeded.
		rejectNext = false;
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});

		expect(updateProfileSpy).toHaveBeenCalledTimes(2);
	});

	// Regression test for a MAJOR review finding: updateName() had no
	// generation guard, so if two submits (A then B) resolved out of order
	// (B first, then a late A), the stale A resolve could overwrite
	// lastSavedNameRef back to A's name even though B was the most recent
	// submit. Fixed by only letting the settle whose generation matches the
	// latest submit mutate lastSavedNameRef.
	it('when submit A resolves after submit B, only B is committed as the saved name', async () => {
		let resolveA: (() => void) | undefined;
		let resolveB: (() => void) | undefined;
		const calls: string[] = [];
		electronApi.updateProfile = (name: string) => {
			calls.push(name);
			if (calls.length === 1) {
				return new Promise<void>((resolve) => {
					resolveA = resolve;
				});
			}
			return new Promise<void>((resolve) => {
				resolveB = resolve;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		// Submit A ("Name A") via Enter, then submit B ("Name B") via Enter
		// before A has resolved — both IPC calls are now in flight.
		await act(async () => {
			input.props.onChange({ target: { value: 'Name A' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});
		await act(async () => {
			input.props.onChange({ target: { value: 'Name B' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});

		expect(calls).toEqual(['Name A', 'Name B']);

		// B resolves first (out of order).
		await act(async () => {
			resolveB?.();
			await Promise.resolve();
		});

		// Then the stale A resolves late.
		await act(async () => {
			resolveA?.();
			await Promise.resolve();
		});

		// Retyping "Name A" and pressing Enter again must be treated as a real
		// change (i.e. lastSavedNameRef points at "Name B", not "Name A"),
		// proving the late A-resolve never overwrote it.
		await act(async () => {
			input.props.onChange({ target: { value: 'Name A' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});

		expect(calls).toEqual(['Name A', 'Name B', 'Name A']);
	});

	// Regression test for a CRITICAL review finding: lastSavedNameRef is only
	// committed once the updateProfile promise *resolves*, so the blur that
	// synchronously follows an Enter commit (Enter commits, then blurs the
	// input) still saw the name as unsaved and started a second, duplicate
	// updateProfile call under a new generation. A deferred (manually
	// resolvable) promise is essential here: with a Promise.resolve() mock,
	// act() flushes the resolve before onBlur runs and the bug is masked.
	// Fixed by the synchronously-set inFlightNameRef.
	it('a blur firing while the Enter-triggered save is still in flight does not double-submit', async () => {
		let resolveSave: (() => void) | undefined;
		const calls: string[] = [];
		electronApi.updateProfile = (name: string) => {
			calls.push(name);
			return new Promise<void>((resolve) => {
				resolveSave = resolve;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});

		// Enter commits (save now in flight, promise NOT yet settled), then the
		// blur handler runs synchronously via the Enter handler's blur() call —
		// exactly the real DOM event order.
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => input.props.onBlur() },
			});
		});

		expect(calls).toEqual(['New Name']);

		// After the save resolves, a further blur is still a no-op because the
		// name is now recorded as successfully saved.
		await act(async () => {
			resolveSave?.();
			await Promise.resolve();
		});
		await act(async () => {
			input.props.onBlur();
		});

		expect(calls).toEqual(['New Name']);
	});

	// After a failed save, an immediate Enter on the *same* name must retry:
	// the in-flight slot is released on rejection, so the duplicate-submit
	// guard must not swallow the retry.
	it('an Enter retry of the same name straight after a rejected save goes through', async () => {
		let rejectSave: ((err: Error) => void) | undefined;
		const calls: string[] = [];
		electronApi.updateProfile = (name: string) => {
			calls.push(name);
			return new Promise<void>((_resolve, reject) => {
				rejectSave = reject;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => input.props.onBlur() },
			});
		});
		expect(calls).toEqual(['New Name']);

		await act(async () => {
			rejectSave?.(new Error('relay offline'));
			await Promise.resolve().catch(() => {});
		});

		// Immediate retry with the unchanged name.
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => input.props.onBlur() },
			});
		});

		expect(calls).toEqual(['New Name', 'New Name']);
	});
});

describe('MenuWindow settings display-name save error feedback', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;

	beforeEach(() => {
		electronApi = createMockElectronApi(
			makeState([
				{
					code: 'blue-table-42',
					groupId: 'group-1',
					isConnected: true,
					members: [],
					relayUrl: 'wss://relay.example',
				},
			]),
		);
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = { electronAPI: electronApi };
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
	});

	async function renderMenuWithSettingsOpen() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<MenuWindow />
				</AppProvider>,
			);
			await Promise.resolve();
			await Promise.resolve();
		});

		const settingsButton = root!.root.findByProps({ title: 'Settings' });
		await act(async () => {
			settingsButton.props.onClick({ stopPropagation: () => {} });
		});

		return root!;
	}

	it('shows an error hint when updateProfile rejects, and clears it on the next successful save', async () => {
		let reject = true;
		electronApi.updateProfile = (_name: string) =>
			reject ? Promise.reject(new Error('relay offline')) : Promise.resolve();
		const root = await renderMenuWithSettingsOpen();
		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});

		expect(root.root.findAllByProps({ 'data-testid': 'display-name-error' }).length).toBe(0);

		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
			await Promise.resolve().catch(() => {});
		});

		const errorHint = root.root.findByProps({ 'data-testid': 'display-name-error' });
		expect(errorHint).toBeDefined();

		// The field stays editable — the same input node is still present and
		// accepts further changes.
		await act(async () => {
			input.props.onChange({ target: { value: 'New Name Retry' } });
		});

		reject = false;
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
			await Promise.resolve();
		});

		expect(root.root.findAllByProps({ 'data-testid': 'display-name-error' }).length).toBe(0);
	});

	// A late REJECT of a stale generation must not surface the error hint
	// when a newer submit has already succeeded — the user's latest intent
	// was saved, so showing "Saving failed" would be wrong.
	it('does not show the error hint when a stale save rejects after a newer save succeeded', async () => {
		let rejectA: ((err: Error) => void) | undefined;
		let resolveB: (() => void) | undefined;
		const calls: string[] = [];
		electronApi.updateProfile = (name: string) => {
			calls.push(name);
			if (calls.length === 1) {
				return new Promise<void>((_resolve, reject) => {
					rejectA = reject;
				});
			}
			return new Promise<void>((resolve) => {
				resolveB = resolve;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		// Submit A, then B while A is still pending.
		await act(async () => {
			input.props.onChange({ target: { value: 'Name A' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});
		await act(async () => {
			input.props.onChange({ target: { value: 'Name B' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
		});
		expect(calls).toEqual(['Name A', 'Name B']);

		// Newer save B succeeds first…
		await act(async () => {
			resolveB?.();
			await Promise.resolve();
		});

		// …then the stale A rejects late. No error hint may appear.
		await act(async () => {
			rejectA?.(new Error('relay offline'));
			await Promise.resolve().catch(() => {});
		});

		expect(root.root.findAllByProps({ 'data-testid': 'display-name-error' }).length).toBe(0);
	});

	// The 4s auto-hide timer must not fire against an unmounted component
	// (cleanup effect clears it on unmount).
	it('unmounting while the error-hint timer is pending does not throw or update state', async () => {
		electronApi.updateProfile = (_name: string) => Promise.reject(new Error('relay offline'));
		const root = await renderMenuWithSettingsOpen();
		const input = root.root.findByProps({ 'data-testid': 'display-name-input' });

		await act(async () => {
			input.props.onChange({ target: { value: 'New Name' } });
		});
		await act(async () => {
			input.props.onKeyDown({
				key: 'Enter',
				preventDefault: () => {},
				currentTarget: { blur: () => {} },
			});
			await Promise.resolve().catch(() => {});
		});

		expect(root.root.findAllByProps({ 'data-testid': 'display-name-error' }).length).toBe(1);

		// Unmount while the 4s auto-hide timeout is still pending.
		await act(async () => {
			root.unmount();
		});
	});
});

describe('MenuWindow update status', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;

	beforeEach(() => {
		electronApi = createMockElectronApi(
			makeState([
				{
					code: 'blue-table-42',
					groupId: 'group-1',
					isConnected: true,
					members: [],
					relayUrl: 'wss://relay.example',
				},
			]),
		);
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = { electronAPI: electronApi };
	});

	afterEach(() => {
		delete (globalThis as unknown as { window?: unknown }).window;
	});

	async function renderMenu() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<MenuWindow />
				</AppProvider>,
			);
			await Promise.resolve();
			await Promise.resolve();
		});
		return root!;
	}

	it('does not render an update status pill while idle', async () => {
		const root = await renderMenu();
		expect(root.root.findAllByProps({ className: 'update-status' }).length).toBe(0);
	});

	it('renders checking state when an update check starts', async () => {
		const root = await renderMenu();
		await act(async () => {
			electronApi.simulateUpdateState({ phase: 'checking' });
		});

		const pill = root.root.findByProps({ className: 'update-status' });
		expect(pill).toBeDefined();
		expect(pill.children[0].children[0]).toBe('Checking for updates…');
	});

	it('renders downloaded state with an Install button', async () => {
		const installSpy = spyOn(electronApi, 'installUpdate');
		const root = await renderMenu();
		await act(async () => {
			electronApi.simulateUpdateState({ phase: 'downloaded', version: '0.2.0' });
		});

		const pill = root.root.findByProps({ className: 'update-status' });
		expect(pill.children[0].children[0]).toContain('Update ready');

		const installButton = pill.findByType('button');
		expect(installButton).toBeDefined();
		expect(installButton.children).toContain('Install');

		await act(async () => {
			installButton.props.onClick();
		});
		expect(installSpy).toHaveBeenCalledTimes(1);
	});

	it('renders error state with a Retry button', async () => {
		const checkSpy = spyOn(electronApi, 'checkForUpdates');
		const root = await renderMenu();
		await act(async () => {
			electronApi.simulateUpdateState({ phase: 'error', error: 'Network request failed' });
		});

		const pill = root.root.findByProps({ className: 'update-status update-error' });
		expect(pill).toBeDefined();

		const retryButton = pill.findByType('button');
		expect(retryButton).toBeDefined();
		expect(retryButton.children).toContain('Retry');

		await act(async () => {
			retryButton.props.onClick();
		});
		expect(checkSpy).toHaveBeenCalledTimes(1);
	});

	it('calls checkForUpdates when the settings popover item is clicked', async () => {
		const checkSpy = spyOn(electronApi, 'checkForUpdates');
		const root = await renderMenu();

		const settingsButton = root.root.findByProps({ title: 'Settings' });
		await act(async () => {
			settingsButton.props.onClick({ stopPropagation: () => {} });
		});

		const popover = root.root.findByProps({ className: 'settings-popover glass' });
		const updateItem = popover.findAllByType('button').find((button: { children: unknown }) => {
			const text = Array.isArray(button.children) ? button.children.join('') : String(button.children ?? '');
			return text === 'Check for Updates…';
		});
		expect(updateItem).toBeDefined();

		await act(async () => {
			updateItem.props.onClick();
		});
		expect(checkSpy).toHaveBeenCalledTimes(1);
	});
});
