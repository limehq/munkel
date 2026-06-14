import { ipcMain } from 'electron';
import {
	deriveGroupKeys,
	seal,
	open,
	encodeChat,
	decodePayload,
} from '@munkel/core';
import type { ChatPayload } from '@munkel/core';

export async function deriveGroupId(code: string): Promise<string> {
	const { groupId } = await deriveGroupKeys(code);
	return groupId;
}

export async function sealChat(code: string, text: string, sentAt?: string): Promise<string> {
	const { messageKey } = await deriveGroupKeys(code);
	const payload: ChatPayload = encodeChat(text, sentAt ? new Date(sentAt) : new Date());
	const plaintext = JSON.stringify(payload);
	return seal(plaintext, messageKey);
}

export async function openChat(
	code: string,
	payload: string,
): Promise<{ kind: 'chat'; text: string; sentAt: string } | null> {
	const { messageKey } = await deriveGroupKeys(code);
	const plaintext = await open(payload, messageKey);
	const decoded = decodePayload(plaintext);
	if (decoded.kind !== 'chat') {
		return null;
	}
	return { kind: 'chat', text: decoded.text, sentAt: decoded.sentAt };
}

export function registerCryptoHandlers(): void {
	ipcMain.handle('derive-group-id', async (_event: unknown, code: string) => {
		return deriveGroupId(code);
	});

	ipcMain.handle('seal-chat', async (_event: unknown, code: string, text: string, sentAt?: string) => {
		return sealChat(code, text, sentAt);
	});

	ipcMain.handle('open-chat', async (_event: unknown, code: string, payload: string) => {
		return openChat(code, payload);
	});
}
