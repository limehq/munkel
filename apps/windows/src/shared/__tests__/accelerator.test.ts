import { describe, expect, it } from 'bun:test';
import { DEFAULT_PALETTE_HOTKEY, formatAcceleratorLabel, isValidAccelerator } from '../accelerator';

describe('isValidAccelerator (Plan 12 P3.1)', () => {
	it('accepts the default hotkey', () => {
		expect(isValidAccelerator(DEFAULT_PALETTE_HOTKEY)).toBe(true);
	});

	it('accepts a single modifier plus a letter', () => {
		expect(isValidAccelerator('Ctrl+P')).toBe(true);
	});

	it('accepts multiple modifiers plus a digit', () => {
		expect(isValidAccelerator('Ctrl+Alt+Shift+9')).toBe(true);
	});

	it('accepts a modifier plus a function key', () => {
		expect(isValidAccelerator('Ctrl+F5')).toBe(true);
		expect(isValidAccelerator('Alt+F24')).toBe(true);
	});

	it('accepts a modifier plus a named key', () => {
		expect(isValidAccelerator('Ctrl+Space')).toBe(true);
		expect(isValidAccelerator('Alt+Up')).toBe(true);
	});

	it('accepts the Super (Windows key) modifier', () => {
		expect(isValidAccelerator('Super+Space')).toBe(true);
	});

	it('rejects a main key with no modifier', () => {
		expect(isValidAccelerator('M')).toBe(false);
	});

	it('rejects modifiers-only combos', () => {
		expect(isValidAccelerator('Ctrl+Shift')).toBe(false);
		expect(isValidAccelerator('Ctrl')).toBe(false);
	});

	it('rejects duplicate modifiers', () => {
		expect(isValidAccelerator('Ctrl+Ctrl+M')).toBe(false);
	});

	it('rejects an unknown modifier token', () => {
		expect(isValidAccelerator('Cmd+M')).toBe(false);
	});

	it('rejects an unrecognized main key', () => {
		expect(isValidAccelerator('Ctrl+NotAKey')).toBe(false);
	});

	it('rejects an out-of-range function key', () => {
		expect(isValidAccelerator('Ctrl+F25')).toBe(false);
	});

	it('rejects empty segments (trailing/leading/double plus)', () => {
		expect(isValidAccelerator('Ctrl++M')).toBe(false);
		expect(isValidAccelerator('Ctrl+M+')).toBe(false);
		expect(isValidAccelerator('+Ctrl+M')).toBe(false);
	});

	it('rejects non-string / empty input', () => {
		expect(isValidAccelerator(undefined)).toBe(false);
		expect(isValidAccelerator(null)).toBe(false);
		expect(isValidAccelerator(42)).toBe(false);
		expect(isValidAccelerator('')).toBe(false);
		expect(isValidAccelerator('   ')).toBe(false);
	});
});

describe('formatAcceleratorLabel', () => {
	it('joins tokens with spaced plus signs for display', () => {
		expect(formatAcceleratorLabel('Ctrl+Shift+M')).toBe('Ctrl + Shift + M');
	});

	it('passes a single-token string through unchanged', () => {
		expect(formatAcceleratorLabel('M')).toBe('M');
	});
});
