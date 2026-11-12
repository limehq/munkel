import type { NotchHistoryEntry } from './useNotchLifecycle';

function orderKey(entry: NotchHistoryEntry): [number, number] {
	const received = Date.parse(entry.receivedAt);
	const sent = Date.parse(entry.sentAt ?? '');
	return [Number.isNaN(sent) ? received : Math.min(sent, received), received];
}

export function insertNotchEntry(history: NotchHistoryEntry[], entry: NotchHistoryEntry): NotchHistoryEntry[] {
	const [sent, received] = orderKey(entry);
	const index = history.findIndex((existing) => {
		const [existingSent, existingReceived] = orderKey(existing);
		return existingSent < sent || (existingSent === sent && existingReceived <= received);
	});
	const at = index === -1 ? history.length : index;
	return [...history.slice(0, at), entry, ...history.slice(at)];
}
