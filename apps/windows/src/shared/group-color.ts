const palette = [
	'#3b82f6',
	'#a855f7',
	'#22c55e',
	'#f59e0b',
	'#ef4444',
	'#06b6d4',
	'#8b5cf6',
	'#ec4899',
	'#14b8a6',
	'#f97316',
];

export function getCircleColor(code: string): string {
	let hash = 0;
	for (let i = 0; i < code.length; i++) {
		hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
	}
	return palette[hash % palette.length];
}
