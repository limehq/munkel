export type FullImageCacheEntry = { data: string; mime: string };

const cache = new Map<string, FullImageCacheEntry>();

export function getFullImageCacheEntry(id: string): FullImageCacheEntry | undefined {
	return cache.get(id);
}

export function setFullImageCacheEntry(id: string, entry: FullImageCacheEntry): void {
	cache.set(id, entry);
}

export function pruneFullImageCache(liveIds: Set<string>): void {
	for (const id of cache.keys()) {
		if (!liveIds.has(id)) cache.delete(id);
	}
}

export function fullImageCacheHas(id: string): boolean {
	return cache.has(id);
}

export function clearFullImageCache(): void {
	cache.clear();
}
