import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { AppProvider } from '../../store/app-store';
import MenuWindow from '../MenuWindow';
import type { StateUpdate } from '../../../shared/types';

function createMockElectronApi(initialState: StateUpdate) {
	return {
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
		selectImages: () => Promise.resolve(undefined),
		beginNotchReply: () => Promise.resolve(),
		endNotchReply: () => Promise.resolve(),
		notchSetInteractive: (_interactive: boolean) => Promise.resolve(),
		notchEmpty: () => Promise.resolve(),
		onStateUpdate: (_cb: (update: StateUpdate) => void) => () => {},
		onGitHubLoginState: (_cb: (state: unknown) => void) => () => {},
		onNotchMessage: (_cb: unknown) => () => {},
		onRelayError: (_cb: unknown) => () => {},
		onNotchShow: (_cb: unknown) => () => {},
		onNotchHide: (_cb: unknown) => () => {},
		onNotchUpdate: (_cb: unknown) => () => {},
		onNotchReopen: (_cb: unknown) => () => {},
	};
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
});
