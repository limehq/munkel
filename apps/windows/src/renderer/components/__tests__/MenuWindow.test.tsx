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
