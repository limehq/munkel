import { z } from 'zod';

/** groupId = hex(HKDF-SHA256(group code, info: "group-id")), see PROTOCOL.md */
export const GROUP_ID_REGEX = /^[a-f0-9]{32}$/;
/** Client-generated installation UUID. */
export const MEMBER_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

/** Base64 ciphertext cap — keeps frames well under the 64 KiB budget. */
export const MAX_PAYLOAD_CHARS = 48 * 1024;

const memberId = z.string().regex(MEMBER_ID_REGEX);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send'),
    payload: z.string().min(1).max(MAX_PAYLOAD_CHARS),
    to: memberId.optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ErrorCode = 'invalid-message' | 'unknown-recipient';

export type ServerMessage =
  | { type: 'welcome'; members: string[] }
  | { type: 'peer-joined'; memberId: string }
  | { type: 'peer-left'; memberId: string }
  | { type: 'message'; from: string; to?: string; payload: string }
  | { type: 'pong' }
  | { type: 'error'; code: ErrorCode; message: string };
