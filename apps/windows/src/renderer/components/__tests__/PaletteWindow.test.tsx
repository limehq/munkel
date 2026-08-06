import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { AppProvider } from '../../store/app-store';
import PaletteWindow from '../PaletteWindow';
import type { StateUpdate } from '../../../shared/types';

// Minimal electronAPI surface PaletteWindow (and the app-store it drives)
// touches. Kept separate from MenuWindow's/NotchWidget's mocks so this file
// states its own dependency surface explicitly.
function createMockElectronApi(initialState: StateUpdate) {
	return {
		getState: () => Promise.resolve(initialState),
		hideWindow: () => Promise.resolve(),
		sendChat: (_code: string, _text: string, _to?: string) => Promise.resolve({ ok: true }),
		sendImages: (_code: string, _paths: string[], _caption: string, _to?: string) =>
			Promise.resolve({ ok: true }),
		selectImages: () => Promise.resolve(undefined),
		saveClipboardImage: () => Promise.resolve(null as string | null),
		onStateUpdate: (_cb: unknown) => () => {},
		onGitHubLoginState: (_cb: unknown) => () => {},
		onUpdateState: (_cb: unknown) => () => {},
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

describe('PaletteWindow clipboard image paste (Plan 12 P3.4)', () => {
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

	async function renderPaletteAtCompose() {
		let root: ReturnType<typeof create>;
		await act(async () => {
			root = create(
				<AppProvider>
					<PaletteWindow />
				</AppProvider>,
			);
			await Promise.resolve();
			await Promise.resolve();
		});
		// Select the first recipient row to reach the compose (message) view.
		await act(async () => {
			root!.root.findByProps({ className: 'recipient-row selected' }).props.onClick();
		});
		return root!;
	}

	function messageInput(root: ReturnType<typeof create>) {
		// The placeholder text changes once images are attached ("Caption N
		// image(s)…"), so key off the stable className instead — the compose
		// row only ever has one `frosted-field` input.
		return root.root.findByProps({ className: 'frosted-field' });
	}

	it('attaches the clipboard image and suppresses default paste when the clipboard holds an image', async () => {
		electronApi.saveClipboardImage = () => Promise.resolve('C:\\temp\\munkel-clipboard-1.png');
		const sendImagesSpy = spyOn(electronApi, 'sendImages');
		const root = await renderPaletteAtCompose();

		let prevented = false;
		await act(async () => {
			messageInput(root).props.onPaste({
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

		const sendButton = root.root.findByProps({ title: 'Send' });
		await act(async () => {
			sendButton.props.onClick();
			await Promise.resolve();
		});

		expect(sendImagesSpy).toHaveBeenCalledTimes(1);
		expect(sendImagesSpy.mock.calls[0]?.[1]).toEqual(['C:\\temp\\munkel-clipboard-1.png']);
	});

	it('leaves normal text paste untouched when the clipboard has no image', async () => {
		const saveClipboardImageSpy = spyOn(electronApi, 'saveClipboardImage');
		const root = await renderPaletteAtCompose();

		let prevented = false;
		await act(async () => {
			messageInput(root).props.onPaste({
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
		// Mixed-content clipboard (image type detected) but the main process
		// rejects the image (sender guard / pixel cap / save failure).
		// preventDefault already ran, so the handler must insert the text
		// manually instead of silently swallowing the paste.
		electronApi.saveClipboardImage = () => Promise.resolve(null);
		const root = await renderPaletteAtCompose();

		await act(async () => {
			messageInput(root).props.onPaste({
				clipboardData: {
					types: ['image/png', 'text/plain'],
					getData: (type: string) => (type === 'text/plain' ? 'pasted text' : ''),
				},
				preventDefault: () => {},
			});
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(messageInput(root).props.value).toBe('pasted text');
		expect(root.root.findAllByProps({ className: 'image-attachment-chip' }).length).toBe(0);
	});

	it('does not attach or call saveClipboardImage once the 8-image cap is reached', async () => {
		electronApi.selectImages = () =>
			Promise.resolve([
				'a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'g.png', 'h.png',
			]);
		const saveClipboardImageSpy = spyOn(electronApi, 'saveClipboardImage');
		const root = await renderPaletteAtCompose();

		const attachButton = root.root.findByProps({ title: 'Attach images' });
		await act(async () => {
			attachButton.props.onClick();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(root.root.findAllByProps({ className: 'image-attachment-chip' }).length).toBe(8);

		await act(async () => {
			messageInput(root).props.onPaste({
				clipboardData: { types: ['image/png'], getData: () => '' },
				preventDefault: () => {},
			});
			await Promise.resolve();
		});

		expect(saveClipboardImageSpy).toHaveBeenCalledTimes(0);
	});
});
