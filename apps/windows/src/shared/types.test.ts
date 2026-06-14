import { expect, test } from 'bun:test';
import type { WindowType } from './types';

test('window types are defined', () => {
	const t: WindowType = 'menu';
	expect(t).toBe('menu');
});
