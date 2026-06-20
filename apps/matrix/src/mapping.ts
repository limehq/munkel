// Translation between Munkel's wire vocabulary and Matrix events.
//
// A Munkel `payload` is an opaque base64 blob (the app's AES-GCM ciphertext). We
// carry it verbatim as the `body` of a custom-msgtype `m.room.message`, so the
// homeserver stores only ciphertext-of-ciphertext (Megolm over the Munkel blob).
//
// memberId <-> MXID: the localpart is a ONE-WAY hash of memberId, so MXID->memberId
// can't be computed — it must be remembered when each member provisions. The
// gateway registers every connecting member here, giving a process-wide reverse map.
import type { MatrixEvent } from "matrix-js-sdk";

/** Custom msgtype so Munkel blobs are trivially distinguishable from chatter. */
export const MUNKEL_MSGTYPE = "app.munkel.blob";
/** Custom content key carrying Munkel's direct-message target (a memberId). */
export const MUNKEL_TO_KEY = "app.munkel.to";

export interface MunkelContent {
  msgtype: string;
  body: string;
  [key: string]: unknown;
}

/** Build the Matrix event content for a Munkel `send` frame. */
export function toMatrixContent(payload: string, to?: string): MunkelContent {
  const content: MunkelContent = { msgtype: MUNKEL_MSGTYPE, body: payload };
  if (to) content[MUNKEL_TO_KEY] = to;
  return content;
}

/** Extract a Munkel payload from a timeline event, or null if it isn't one. */
export function fromMatrixEvent(event: MatrixEvent): { payload: string; to?: string } | null {
  if (event.getType() !== "m.room.message") return null;
  const content = event.getContent() as Record<string, unknown>;
  if (content.msgtype !== MUNKEL_MSGTYPE) return null;
  if (typeof content.body !== "string") return null;
  const to = content[MUNKEL_TO_KEY];
  return { payload: content.body, to: typeof to === "string" ? to : undefined };
}

// --- process-wide MXID <-> memberId registry (one gateway process) ----------
const mxidToMember = new Map<string, string>();

/** Remember an MXID's memberId so inbound senders can be named. */
export function registerIdentity(memberId: string, mxid: string): void {
  mxidToMember.set(mxid, memberId);
}

/**
 * Reverse-map an MXID to a memberId. Falls back to the localpart for an MXID we
 * never saw provision (shouldn't happen in the PoC: only gateway-connected
 * members are ever in a circle room) so the wire protocol always has a memberId.
 */
export function memberIdForMxid(mxid: string): string {
  const known = mxidToMember.get(mxid);
  if (known) return known;
  const localpart = mxid.replace(/^@/, "").split(":")[0];
  return localpart || mxid;
}

/** Test seam: forget all identities. */
export function resetIdentities(): void {
  mxidToMember.clear();
}
