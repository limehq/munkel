export function pruneNotchHistory<T extends { receivedAt: string }>(
	items: T[],
	now: number,
	windowMs = 60_000,
): T[] {
	return items.filter((item) => now - Date.parse(item.receivedAt) < windowMs);
}
