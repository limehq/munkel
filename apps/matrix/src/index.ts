// @munkel/matrix — Munkel's circles, members and messages mapped onto a real
// Matrix homeserver. The gateway consumes MunkelMatrixSession; the rest is
// exported for tests and for a future native (matrix-rust-sdk in-app) port.
export { MunkelMatrixSession, UnknownRecipientError } from "./client.ts";
export type { MunkelSessionOpts, MunkelSessionEvents } from "./client.ts";

export {
  ensureMatrixUser,
  localpartForMember,
  mxidForMember,
  passwordForMember,
  MemoryCredStore,
} from "./provision.ts";
export type { MatrixCreds, CredStore } from "./provision.ts";

export { aliasLocalpart, fullAlias, joinOrCreateCircle, joinedMemberIds, onMembership } from "./room.ts";
export { initCircleCrypto, awaitDecrypted, isUsableMessage } from "./crypto.ts";
export { putBlob, getBlob, resolveBlob, InMemoryBlobIndex, MAX_BLOB_BYTES } from "./media.ts";
export type { BlobRef, BlobIndex } from "./media.ts";
export {
  MUNKEL_MSGTYPE,
  MUNKEL_TO_KEY,
  toMatrixContent,
  fromMatrixEvent,
  registerIdentity,
  memberIdForMxid,
} from "./mapping.ts";
