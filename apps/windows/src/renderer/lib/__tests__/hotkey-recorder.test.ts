import { describe, expect, it } from 'bun:test';
import { acceleratorFromKeyboardEvent, type HotkeyKeyboardEvent } from '../hotkey-recorder';

function keyEvent(overrides: Partial<HotkeyKeyboardEvent>): HotkeyKeyboardEvent {
	return {
		key: 'a',
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		metaKey: false,
		...overrides,
	};
}

describe('acceleratorFromKeyboardEvent (Plan 12 P3.1)', () => {
	it('builds Ctrl+Shift+M from a matching key event', () => {
		const accelerator = acceleratorFromKeyboardEvent(
			keyEvent({ key: 'm', ctrlKey: true, shiftKey: true }),
		);
		expect(accelerator).toBe('Ctrl+Shift+M');
	});

	it('builds a single-modifier combo', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'p', ctrlKey: true }))).toBe('Ctrl+P');
	});

	it('maps the Windows/meta key to Super', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'p', metaKey: true }))).toBe('Super+P');
	});

	it('maps named keys (Space, arrows, Escape) to their accelerator tokens', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: ' ', altKey: true }))).toBe('Alt+Space');
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'ArrowUp', ctrlKey: true }))).toBe('Ctrl+Up');
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'Escape', ctrlKey: true }))).toBe('Ctrl+Escape');
	});

	it('maps function keys', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'F5', ctrlKey: true }))).toBe('Ctrl+F5');
	});

	it('uppercases a lowercase letter key', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'q', ctrlKey: true }))).toBe('Ctrl+Q');
	});

	it('returns null for a bare modifier press (still waiting for the real key)', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'Control', ctrlKey: true }))).toBeNull();
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'Shift', shiftKey: true }))).toBeNull();
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'Meta', metaKey: true }))).toBeNull();
	});

	it('returns null when no modifier is held', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'm' }))).toBeNull();
	});

	it('returns null for a key with no accelerator mapping', () => {
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'CapsLock', ctrlKey: true }))).toBeNull();
		expect(acceleratorFromKeyboardEvent(keyEvent({ key: 'ContextMenu', ctrlKey: true }))).toBeNull();
	});
});
