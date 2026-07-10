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
		getLaunchAtLogin: () => Promise.resolve(false),
		setLaunchAtLogin: (_enabled: boolean) => Promise.resolve(true),
		getAutoUpdateCheck: () => Promise.resolve(true),
		setAutoUpdateCheck: (_enabled: boolean) => Promise.resolve(true),
		getPaletteHotkey: () => Promise.resolve('Ctrl+Shift+M'),
		setPaletteHotkey: (accelerator: string) => Promise.resolve({ ok: true, accelerator }),
		selectImages: () => Promise.resolve(undefined),
		saveClipboardImage: () => Promise.resolve(null),
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

describe('MenuWindow launch-at-login toggle (P2.1)', () => {
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
			await Promise.resolve();
		});

		return root!;
	}

	it('defaults to unchecked when no launch-at-login preference is persisted', async () => {
		const root = await renderMenuWithSettingsOpen();
		const checkbox = root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' });
		expect(checkbox.props.checked).toBe(false);
	});

	it('reflects a persisted true preference fetched on mount', async () => {
		electronApi.getLaunchAtLogin = () => Promise.resolve(true);
		const root = await renderMenuWithSettingsOpen();
		const checkbox = root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' });
		expect(checkbox.props.checked).toBe(true);
	});

	it('toggling calls setLaunchAtLogin(true) and reflects the new checked state', async () => {
		const setSpy = spyOn(electronApi, 'setLaunchAtLogin');
		const root = await renderMenuWithSettingsOpen();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' }).props.onChange();
			await Promise.resolve();
		});

		expect(setSpy).toHaveBeenCalledTimes(1);
		expect(setSpy).toHaveBeenCalledWith(true);
		const checkbox = root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' });
		expect(checkbox.props.checked).toBe(true);
	});

	it('toggling off calls setLaunchAtLogin(false) when currently enabled', async () => {
		electronApi.getLaunchAtLogin = () => Promise.resolve(true);
		const setSpy = spyOn(electronApi, 'setLaunchAtLogin');
		const root = await renderMenuWithSettingsOpen();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' }).props.onChange();
			await Promise.resolve();
		});

		expect(setSpy).toHaveBeenCalledWith(false);
	});

	it('snaps the checkbox back to its previous state when setLaunchAtLogin fails', async () => {
		electronApi.setLaunchAtLogin = (_enabled: boolean) => Promise.resolve(false);
		const root = await renderMenuWithSettingsOpen();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' }).props.onChange();
			await Promise.resolve();
			await Promise.resolve();
		});

		const checkbox = root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' });
		expect(checkbox.props.checked).toBe(false);
	});

	// In-flight guard: a rapid double-click must not fire a second IPC call
	// while the first is still unresolved (analogous to inFlightNameRef on
	// the display-name save). A deferred promise is essential here — with a
	// Promise.resolve() mock, act() would settle call #1 before click #2.
	it('ignores a second toggle while the first setLaunchAtLogin call is still in flight', async () => {
		let resolveFirst: ((ok: boolean) => void) | undefined;
		const calls: boolean[] = [];
		electronApi.setLaunchAtLogin = (enabled: boolean) => {
			calls.push(enabled);
			return new Promise<boolean>((resolve) => {
				resolveFirst = resolve;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		const checkbox = () => root.root.findByProps({ 'data-testid': 'launch-at-login-checkbox' });

		// Two clicks in the same interaction burst; the first promise is
		// still pending when the second click lands.
		await act(async () => {
			checkbox().props.onChange();
		});
		await act(async () => {
			checkbox().props.onChange();
		});

		expect(calls).toEqual([true]);

		// After the first call settles, toggling works again.
		await act(async () => {
			resolveFirst?.(true);
			await Promise.resolve();
		});
		await act(async () => {
			checkbox().props.onChange();
		});

		expect(calls).toEqual([true, false]);
	});
});

describe('MenuWindow auto-update "Check Automatically" toggle (P3.7)', () => {
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
			await Promise.resolve();
		});

		return root!;
	}

	it('defaults to checked (today\'s unconditional-check behavior) before the persisted value loads', async () => {
		// getAutoUpdateCheck never resolves in this test, so the component's
		// initial `true` default is what renders.
		electronApi.getAutoUpdateCheck = () => new Promise(() => {});
		const root = await renderMenuWithSettingsOpen();
		const checkbox = root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' });
		expect(checkbox.props.checked).toBe(true);
	});

	it('reflects a persisted false preference fetched on mount', async () => {
		electronApi.getAutoUpdateCheck = () => Promise.resolve(false);
		const root = await renderMenuWithSettingsOpen();
		const checkbox = root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' });
		expect(checkbox.props.checked).toBe(false);
	});

	it('toggling off calls setAutoUpdateCheck(false) and reflects the new checked state', async () => {
		const setSpy = spyOn(electronApi, 'setAutoUpdateCheck');
		const root = await renderMenuWithSettingsOpen();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' }).props.onChange();
			await Promise.resolve();
		});

		expect(setSpy).toHaveBeenCalledTimes(1);
		expect(setSpy).toHaveBeenCalledWith(false);
		const checkbox = root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' });
		expect(checkbox.props.checked).toBe(false);
	});

	it('toggling on calls setAutoUpdateCheck(true) when currently disabled', async () => {
		electronApi.getAutoUpdateCheck = () => Promise.resolve(false);
		const setSpy = spyOn(electronApi, 'setAutoUpdateCheck');
		const root = await renderMenuWithSettingsOpen();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' }).props.onChange();
			await Promise.resolve();
		});

		expect(setSpy).toHaveBeenCalledWith(true);
	});

	it('snaps the checkbox back to its previous state when setAutoUpdateCheck fails', async () => {
		electronApi.setAutoUpdateCheck = (_enabled: boolean) => Promise.resolve(false);
		const root = await renderMenuWithSettingsOpen();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' }).props.onChange();
			await Promise.resolve();
			await Promise.resolve();
		});

		const checkbox = root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' });
		expect(checkbox.props.checked).toBe(true);
	});

	// In-flight guard, same rationale as the launch-at-login toggle above: a
	// rapid double-click must not fire a second IPC call while the first is
	// still unresolved.
	it('ignores a second toggle while the first setAutoUpdateCheck call is still in flight', async () => {
		let resolveFirst: ((ok: boolean) => void) | undefined;
		const calls: boolean[] = [];
		electronApi.setAutoUpdateCheck = (enabled: boolean) => {
			calls.push(enabled);
			return new Promise<boolean>((resolve) => {
				resolveFirst = resolve;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		const checkbox = () => root.root.findByProps({ 'data-testid': 'auto-update-check-checkbox' });

		await act(async () => {
			checkbox().props.onChange();
		});
		await act(async () => {
			checkbox().props.onChange();
		});

		expect(calls).toEqual([false]);

		await act(async () => {
			resolveFirst?.(true);
			await Promise.resolve();
		});
		await act(async () => {
			checkbox().props.onChange();
		});

		expect(calls).toEqual([false, true]);
	});
});

describe('MenuWindow rebindable palette hotkey recorder (P3.1)', () => {
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
			await Promise.resolve();
		});

		return root!;
	}

	function recorder(root: ReturnType<typeof create>) {
		return root.root.findByProps({ 'data-testid': 'palette-hotkey-recorder' });
	}

	function pressKey(
		root: ReturnType<typeof create>,
		overrides: Partial<{ key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }>,
	) {
		return recorder(root).props.onKeyDown({
			key: 'a',
			ctrlKey: false,
			altKey: false,
			shiftKey: false,
			metaKey: false,
			preventDefault: () => {},
			currentTarget: { blur: () => {} },
			...overrides,
		});
	}

	it('defaults to the persisted hotkey (Ctrl+Shift+M) before/after mount', async () => {
		const root = await renderMenuWithSettingsOpen();
		expect(recorder(root).props.children).toBe('Ctrl + Shift + M');
	});

	it('reflects a persisted non-default hotkey fetched on mount', async () => {
		electronApi.getPaletteHotkey = () => Promise.resolve('Ctrl+Alt+P');
		const root = await renderMenuWithSettingsOpen();
		expect(recorder(root).props.children).toBe('Ctrl + Alt + P');
	});

	it('shows a recording placeholder on focus', async () => {
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});
		expect(recorder(root).props.children).toBe('Press a key combo…');
	});

	it('commits a captured combo via setPaletteHotkey and displays the confirmed value', async () => {
		const setSpy = spyOn(electronApi, 'setPaletteHotkey');
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});

		await act(async () => {
			pressKey(root, { key: 'p', ctrlKey: true, altKey: true });
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(setSpy).toHaveBeenCalledTimes(1);
		expect(setSpy).toHaveBeenCalledWith('Ctrl+Alt+P');
		expect(recorder(root).props.children).toBe('Ctrl + Alt + P');
	});

	it('ignores a bare modifier press and keeps recording (no IPC call)', async () => {
		const setSpy = spyOn(electronApi, 'setPaletteHotkey');
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});

		await act(async () => {
			pressKey(root, { key: 'Control', ctrlKey: true });
		});

		expect(setSpy).not.toHaveBeenCalled();
		expect(recorder(root).props.children).toBe('Press a key combo…');
	});

	it('Escape cancels recording without committing a change', async () => {
		const setSpy = spyOn(electronApi, 'setPaletteHotkey');
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});

		let blurred = false;
		await act(async () => {
			recorder(root).props.onKeyDown({
				key: 'Escape',
				ctrlKey: false,
				altKey: false,
				shiftKey: false,
				metaKey: false,
				preventDefault: () => {},
				currentTarget: {
					blur: () => {
						blurred = true;
					},
				},
			});
		});

		expect(blurred).toBe(true);
		expect(setSpy).not.toHaveBeenCalled();

		// Blur (simulated separately, since the fake event's blur() above does
		// not trigger React's onBlur) ends the recording UI state.
		await act(async () => {
			recorder(root).props.onBlur();
		});
		expect(recorder(root).props.children).toBe('Ctrl + Shift + M');
	});

	it('snaps back to the accelerator the main process reports on a failed rebind (rollback)', async () => {
		electronApi.setPaletteHotkey = (_accelerator: string) =>
			Promise.resolve({ ok: false, accelerator: 'Ctrl+Shift+M', error: 'registration-failed' });
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});

		await act(async () => {
			pressKey(root, { key: 'p', ctrlKey: true, altKey: true });
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(recorder(root).props.children).toBe('Ctrl + Shift + M');
		expect(root.root.findByProps({ 'data-testid': 'palette-hotkey-error' })).toBeTruthy();

		// The failed rebind above armed a 4s auto-clear timer for the error
		// hint (see hotkeyErrorTimeoutRef in MenuWindow.tsx); unmount here so
		// its cleanup effect clears the timer instead of it firing later,
		// outside any act(), during a subsequent test in this file.
		await act(async () => {
			root.unmount();
		});
	});

	it('shows an invalid-accelerator hint distinct from the registration-failed hint', async () => {
		electronApi.setPaletteHotkey = (_accelerator: string) =>
			Promise.resolve({ ok: false, accelerator: 'Ctrl+Shift+M', error: 'invalid-accelerator' });
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});

		await act(async () => {
			pressKey(root, { key: 'p', ctrlKey: true });
			await Promise.resolve();
			await Promise.resolve();
		});

		const error = root.root.findByProps({ 'data-testid': 'palette-hotkey-error' });
		expect(error.props.children).toContain('Invalid shortcut');

		// Same rationale as above: clear the armed auto-clear timer.
		await act(async () => {
			root.unmount();
		});
	});

	it('ignores a second key capture while the first setPaletteHotkey call is still in flight', async () => {
		let resolveFirst: ((result: { ok: boolean; accelerator: string }) => void) | undefined;
		const calls: string[] = [];
		electronApi.setPaletteHotkey = (accelerator: string) => {
			calls.push(accelerator);
			return new Promise((resolve) => {
				resolveFirst = resolve;
			});
		};
		const root = await renderMenuWithSettingsOpen();
		await act(async () => {
			recorder(root).props.onFocus();
		});

		await act(async () => {
			pressKey(root, { key: 'p', ctrlKey: true });
		});
		await act(async () => {
			pressKey(root, { key: 'q', ctrlKey: true });
		});

		expect(calls).toEqual(['Ctrl+P']);

		await act(async () => {
			resolveFirst?.({ ok: true, accelerator: 'Ctrl+P' });
			await Promise.resolve();
		});

		expect(calls).toEqual(['Ctrl+P']);
	});

	it('the reset button restores the default hotkey via setPaletteHotkey', async () => {
		electronApi.getPaletteHotkey = () => Promise.resolve('Ctrl+Alt+P');
		const setSpy = spyOn(electronApi, 'setPaletteHotkey');
		const root = await renderMenuWithSettingsOpen();

		const resetButton = root.root.findByProps({ 'data-testid': 'palette-hotkey-reset' });
		await act(async () => {
			resetButton.props.onClick();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(setSpy).toHaveBeenCalledWith('Ctrl+Shift+M');
		expect(recorder(root).props.children).toBe('Ctrl + Shift + M');
	});

	it('the bottom Quick-send hotkey label reflects the persisted (non-default) hotkey', async () => {
		electronApi.getPaletteHotkey = () => Promise.resolve('Ctrl+Alt+P');
		const root = await renderMenuWithSettingsOpen();
		const label = root.root.findByProps({ className: 'hotkey' });
		expect(label.props.children).toBe('Ctrl + Alt + P');
	});
});

describe('MenuWindow recipient avatar chips (P2.4)', () => {
	let electronApi: ReturnType<typeof createMockElectronApi>;

	function stateWithMembers(): StateUpdate {
		return makeState([
			{
				code: 'blue-table-42',
				groupId: 'group-1',
				isConnected: true,
				members: [
					{ memberId: 'member-1', displayName: 'Ada Lovelace', joinedAt: '2026-01-01T00:00:00.000Z' },
					{ memberId: 'member-2', displayName: 'Grace Hopper', joinedAt: '2026-01-01T00:00:00.000Z' },
				],
				relayUrl: 'wss://relay.example',
			},
		]);
	}

	beforeEach(() => {
		electronApi = createMockElectronApi(stateWithMembers());
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

	it('renders an "All" chip plus one chip per member', async () => {
		const root = await renderMenu();

		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-all' })).toBeDefined();
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' })).toBeDefined();
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-2' })).toBeDefined();
	});

	it('the "All" chip is selected by default', async () => {
		const root = await renderMenu();

		const allChip = root.root.findByProps({ 'data-testid': 'recipient-chip-all' });
		expect(allChip.props['aria-checked']).toBe(true);
		expect(allChip.props.className).toContain('selected');

		const memberChip = root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' });
		expect(memberChip.props['aria-checked']).toBe(false);
	});

	it('clicking a member chip selects it and deselects "All"', async () => {
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props.onClick();
		});

		const memberChip = root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' });
		expect(memberChip.props['aria-checked']).toBe(true);
		expect(memberChip.props.className).toContain('selected');

		const allChip = root.root.findByProps({ 'data-testid': 'recipient-chip-all' });
		expect(allChip.props['aria-checked']).toBe(false);
	});

	it('clicking a member chip then sending routes the message to that member (same selection contract as the old select)', async () => {
		const sendChatSpy = spyOn(electronApi, 'sendChat');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-member-2' }).props.onClick();
		});

		const messageInput = root.root.findByProps({ placeholder: 'Message…' });
		await act(async () => {
			messageInput.props.onChange({ target: { value: 'hello' } });
		});
		await act(async () => {
			messageInput.props.onKeyDown({ key: 'Enter' });
		});

		expect(sendChatSpy).toHaveBeenCalledWith('blue-table-42', 'hello', 'member-2');
	});

	it('clicking the "All" chip after selecting a member sends without a recipient (broadcast)', async () => {
		const sendChatSpy = spyOn(electronApi, 'sendChat');
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props.onClick();
		});
		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props.onClick();
		});

		const messageInput = root.root.findByProps({ placeholder: 'Message…' });
		await act(async () => {
			messageInput.props.onChange({ target: { value: 'hi everyone' } });
		});
		await act(async () => {
			messageInput.props.onKeyDown({ key: 'Enter' });
		});

		expect(sendChatSpy).toHaveBeenCalledWith('blue-table-42', 'hi everyone', undefined);
	});

	it('renders a tooltip title with the full member name', async () => {
		const root = await renderMenu();

		const memberChip = root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' });
		expect(memberChip.props.title).toBe('Ada Lovelace');
	});

	it('shows "No one else online" text when a circle has no other members', async () => {
		electronApi = createMockElectronApi(makeState([
			{
				code: 'blue-table-42',
				groupId: 'group-1',
				isConnected: true,
				members: [],
				relayUrl: 'wss://relay.example',
			},
		]));
		(globalThis as unknown as { window: { electronAPI: typeof electronApi } }).window = { electronAPI: electronApi };

		const root = await renderMenu();

		const emptyHint = root.root.findByProps({ className: 'caption recipient-empty' });
		expect(emptyHint.children).toContain('No one else online');
		expect(root.root.findAllByProps({ 'data-testid': 'recipient-chip-member-1' }).length).toBe(0);
	});

	it('exposes WAI-ARIA radiogroup semantics (radiogroup row, radio chips)', async () => {
		const root = await renderMenu();

		const row = root.root.findByProps({ 'data-testid': 'recipient-row' });
		expect(row.props.role).toBe('radiogroup');
		expect(row.props['aria-label']).toBe('Recipient');

		for (const testid of ['recipient-chip-all', 'recipient-chip-member-1', 'recipient-chip-member-2']) {
			expect(root.root.findByProps({ 'data-testid': testid }).props.role).toBe('radio');
		}
	});

	it('uses a roving tabindex: only the selected chip is a Tab stop', async () => {
		const root = await renderMenu();

		// Default: "All" selected → tabIndex 0, members -1.
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props.tabIndex).toBe(0);
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props.tabIndex).toBe(-1);

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props.onClick();
		});

		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props.tabIndex).toBe(-1);
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props.tabIndex).toBe(0);
	});

	it('ArrowRight moves the selection to the next chip, wrapping at the end', async () => {
		const root = await renderMenu();
		const keyEvent = (key: string) => {
			let prevented = false;
			return {
				event: {
					key,
					preventDefault: () => {
						prevented = true;
					},
				},
				wasPrevented: () => prevented,
			};
		};

		// All → member-1
		const e1 = keyEvent('ArrowRight');
		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props.onKeyDown(e1.event);
		});
		expect(e1.wasPrevented()).toBe(true);
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props['aria-checked']).toBe(true);

		// member-1 → member-2 → wraps back to All
		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-member-1' }).props.onKeyDown(keyEvent('ArrowRight').event);
		});
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-2' }).props['aria-checked']).toBe(true);

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-member-2' }).props.onKeyDown(keyEvent('ArrowRight').event);
		});
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props['aria-checked']).toBe(true);
	});

	it('ArrowLeft moves the selection backwards, wrapping from All to the last chip', async () => {
		const root = await renderMenu();

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props.onKeyDown({
				key: 'ArrowLeft',
				preventDefault: () => {},
			});
		});

		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-member-2' }).props['aria-checked']).toBe(true);
	});

	it('non-arrow keys on a chip do not change the selection or prevent default', async () => {
		const root = await renderMenu();
		let prevented = false;

		await act(async () => {
			root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props.onKeyDown({
				key: 'Tab',
				preventDefault: () => {
					prevented = true;
				},
			});
		});

		expect(prevented).toBe(false);
		expect(root.root.findByProps({ 'data-testid': 'recipient-chip-all' }).props['aria-checked']).toBe(true);
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

describe('MenuWindow clipboard image paste (Plan 12 P3.4)', () => {
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

	it('attaches the clipboard image and suppresses default paste when the clipboard holds an image', async () => {
		electronApi.saveClipboardImage = () => Promise.resolve('C:\\temp\\munkel-clipboard-1.png');
		const sendImagesSpy = spyOn(electronApi, 'sendImages');
		const root = await renderMenu();

		const input = root.root.findByProps({ placeholder: 'Message…' });
		let prevented = false;
		await act(async () => {
			input.props.onPaste({
				clipboardData: { types: ['image/png', 'Files'], getData: () => '' },
				preventDefault: () => {
					prevented = true;
				},
			});
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(prevented).toBe(true);
		const chip = root.root.findByProps({ className: 'image-attachment-chip' });
		expect(chip).toBeDefined();

		const sendRow = root.root.findByProps({ className: 'send-row' });
		const send = sendRow.findAllByType('button')[1];
		await act(async () => {
			send.props.onClick();
			await Promise.resolve();
		});

		expect(sendImagesSpy).toHaveBeenCalledTimes(1);
		expect(sendImagesSpy.mock.calls[0]?.[1]).toEqual(['C:\\temp\\munkel-clipboard-1.png']);
	});

	it('leaves normal text paste untouched when the clipboard has no image', async () => {
		const saveClipboardImageSpy = spyOn(electronApi, 'saveClipboardImage');
		const root = await renderMenu();

		const input = root.root.findByProps({ placeholder: 'Message…' });
		let prevented = false;
		await act(async () => {
			input.props.onPaste({
				clipboardData: { types: ['text/plain'] },
				preventDefault: () => {
					prevented = true;
				},
			});
			await Promise.resolve();
		});

		expect(prevented).toBe(false);
		expect(saveClipboardImageSpy).toHaveBeenCalledTimes(0);
		expect(root.root.findAllByProps({ className: 'image-attachment-chip' }).length).toBe(0);
	});

	it('falls back to inserting the clipboard text when the image fetch returns null after preventDefault', async () => {
		electronApi.saveClipboardImage = () => Promise.resolve(null);
		const root = await renderMenu();

		const input = root.root.findByProps({ placeholder: 'Message…' });
		await act(async () => {
			input.props.onPaste({
				clipboardData: {
					types: ['image/png', 'text/plain'],
					getData: (type: string) => (type === 'text/plain' ? 'pasted text' : ''),
				},
				preventDefault: () => {},
			});
			await Promise.resolve();
			await Promise.resolve();
		});

		// Placeholder stays 'Message…' (no attachment), and the input now
		// carries the manually inserted clipboard text.
		expect(root.root.findByProps({ placeholder: 'Message…' }).props.value).toBe('pasted text');
		expect(root.root.findAllByProps({ className: 'image-attachment-chip' }).length).toBe(0);
	});
});
