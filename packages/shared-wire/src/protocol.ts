/**
 * Relay WebSocket message schema and types.
 *
 * See {@link ../PROTOCOL.md} for the full Munkel wire protocol v1 spec.
 */

import { z } from 'zod';
import { MAX_PAYLOAD_CHARS } from './wire-constants.js';

/** groupId = hex(HKDF-SHA256(group code, info: "group-id")) — see PROTOCOL.md. */
export const GROUP_ID_REGEX = /^[a-f0-9]{32}$/;
/** Client-generated installation UUID. */
export const MEMBER_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export { MAX_PAYLOAD_CHARS };

const memberId = z.string().regex(MEMBER_ID_REGEX);

/**
 * Client → server frames. `send` without `to` is a group broadcast; with
 * `to` (a memberId) the server delivers to that member only.
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('send'),
    payload: z.string().min(1).max(MAX_PAYLOAD_CHARS),
    to: memberId.optional(),
  }),
  z.object({ type: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ErrorCode = 'invalid-message' | 'unknown-recipient' | 'rate-limited';

/**
 * Server → client frames. `welcome` is the first frame after connecting and
 * lists the other members currently online. `message` is never echoed back
 * to the sender; `peer-left` is sent on disconnect, not on reconnect-replace.
 */
export type ServerMessage =
  | { type: 'welcome'; members: string[] }
  | { type: 'peer-joined'; memberId: string }
  | { type: 'peer-left'; memberId: string }
  | { type: 'message'; from: string; to?: string; payload: string }
  | { type: 'pong' }
  | { type: 'error'; code: ErrorCode; message: string };
