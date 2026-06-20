// A Munkel circle == a Matrix room, addressed by an alias derived from the
// 32-hex groupId. Membership IS presence (joined members map to Munkel's
// `welcome`/`peer-joined`/`peer-left`).
//
// Access control mirrors Munkel exactly: the room is created with PUBLIC join
// rules but kept OUT of the public directory (private visibility). The only way
// to find it is to know the alias, and the alias localpart is the unguessable
// 128-bit groupId — i.e. "knowing the code is knowing the group", no invite.
import { Preset, Visibility, EventType, RoomMemberEvent } from "matrix-js-sdk";
import type { MatrixClient, MatrixEvent, RoomMember } from "matrix-js-sdk";

const GROUP_ID_REGEX = /^[0-9a-f]{32}$/;

export function aliasLocalpart(groupId: string): string {
  if (!GROUP_ID_REGEX.test(groupId)) throw new Error(`bad groupId: ${groupId}`);
  return `munkel_${groupId}`;
}

export function fullAlias(groupId: string, serverName: string): string {
  return `#${aliasLocalpart(groupId)}:${serverName}`;
}

/**
 * Resolve-and-join the circle room, creating it (with the alias + encryption) if
 * it doesn't exist yet. Race-safe: a peer can win the create between our
 * M_NOT_FOUND and our createRoom, which surfaces as M_ROOM_IN_USE — we then
 * re-resolve and join. Returns the shared room id.
 */
export async function joinOrCreateCircle(
  client: MatrixClient,
  groupId: string,
  serverName: string,
): Promise<string> {
  const alias = fullAlias(groupId, serverName);
  const deadline = Date.now() + 8000;
  let lastErr: unknown;

  // Concurrent first-join of a fresh circle is genuinely racy in Matrix: two
  // members can both createRoom with the same alias, and for a few hundred ms
  // after a create the winner's room reports transient 404 ("no servers") / 403
  // ("not invited", before its public join_rules state is consistent). So we loop
  // resolve -> join, creating when the alias is absent, until it converges.
  while (Date.now() < deadline) {
    let resolved: { room_id: string; servers?: string[] };
    try {
      resolved = await client.getRoomIdForAlias(alias);
    } catch (e) {
      if ((e as { errcode?: string }).errcode !== "M_NOT_FOUND") {
        lastErr = e;
        await sleep(300);
        continue;
      }
      // Alias absent -> create it. A lost race surfaces as 409; loop back to join.
      try {
        const { room_id } = await client.createRoom(circleRoomOptions(groupId));
        return room_id;
      } catch (ce) {
        const err = ce as { errcode?: string; httpStatus?: number };
        if (err.httpStatus === 409 || err.errcode === "M_ROOM_IN_USE") {
          lastErr = ce;
          await sleep(200);
          continue;
        }
        throw ce;
      }
    }

    // Alias resolved -> join it (retrying the transient post-create window).
    try {
      await client.joinRoom(resolved.room_id, {
        viaServers: resolved.servers?.length ? resolved.servers : [serverName],
      });
      return resolved.room_id;
    } catch (e) {
      if (!isTransientJoin(e)) throw e;
      lastErr = e;
      await sleep(400);
    }
  }
  throw lastErr ?? new Error(`joinOrCreateCircle(${alias}) timed out`);
}

/** createRoom options for a circle: public join, private directory, Megolm, no backfill. */
function circleRoomOptions(groupId: string): Parameters<MatrixClient["createRoom"]>[0] {
  return {
    room_alias_name: aliasLocalpart(groupId), // localpart only, no '#'/server
    visibility: Visibility.Private, // keep OUT of the public room directory
    preset: Preset.PublicChat, // public join_rules => join-by-alias, no invite
    // Constant name: never put any of the groupId into cleartext m.room.name state.
    name: "munkel circle",
    initial_state: [
      { type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } },
      { type: EventType.RoomHistoryVisibility, state_key: "", content: { history_visibility: "joined" } },
      { type: EventType.RoomGuestAccess, state_key: "", content: { guest_access: "forbidden" } },
    ],
  };
}

/**
 * Whether a join error is the transient post-create window rather than a real
 * refusal. Our rooms are always PublicChat, so a 403 "not invited" or a 404 "no
 * servers" right after a concurrent create is eventual consistency, not policy.
 */
function isTransientJoin(e: unknown): boolean {
  const err = e as { httpStatus?: number; message?: string };
  return err.httpStatus === 404 || err.httpStatus === 403 || /no servers/i.test(String(err.message ?? ""));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Currently-joined member MXIDs (membership === 'join'). Maps to `welcome`. */
export function joinedMemberIds(client: MatrixClient, roomId: string): string[] {
  const room = client.getRoom(roomId);
  return room ? room.getJoinedMembers().map((m) => m.userId) : [];
}

/**
 * Subscribe to live membership deltas for one room. Keyed on the NEW membership
 * value (Matrix persists 'leave' state, so we must read the value, not the
 * mere event). Returns an unsubscribe function.
 */
export function onMembership(
  client: MatrixClient,
  roomId: string,
  onJoin: (mxid: string) => void,
  onLeave: (mxid: string) => void,
): () => void {
  const handler = (_event: MatrixEvent, member: RoomMember): void => {
    if (member.roomId !== roomId) return;
    if (member.membership === "join") onJoin(member.userId);
    else if (member.membership === "leave" || member.membership === "ban") onLeave(member.userId);
  };
  client.on(RoomMemberEvent.Membership, handler);
  return () => client.off(RoomMemberEvent.Membership, handler);
}
