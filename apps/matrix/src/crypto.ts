// Rust-crypto (Megolm) setup for a closed circle, plus reliable decryption.
//
// Runs on Node 24 — the matrix-sdk-crypto WASM is verified there (Bun is not).
// We deliberately skip cross-signing / key-backup: for a 2–N member ephemeral
// circle the only requirement is that every joined device can decrypt, which
// `globalBlacklistUnverifiedDevices = false` guarantees (keys are shared to all
// joined devices, verified or not — exactly Munkel's "knowing the code is enough").
import { MatrixEventEvent } from "matrix-js-sdk";
import type { MatrixClient, MatrixEvent } from "matrix-js-sdk";

/** Initialise in-memory Megolm crypto and share keys to all joined devices. */
export async function initCircleCrypto(client: MatrixClient): Promise<void> {
  await client.initRustCrypto({ useIndexedDB: false });
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("rust crypto failed to initialise");
  // Share room keys to every joined device in the circle (no verification dance).
  crypto.globalBlacklistUnverifiedDevices = false;
}

/**
 * Resolve once an event's cleartext is available: immediately if already clear,
 * otherwise when the SDK fires Decrypted. Bounded so a stuck UTD can't hang a
 * caller. The listener is attached before the final clear-content re-check, so a
 * Decrypted that fires in the gap between guard and attach is not missed.
 */
export function awaitDecrypted(event: MatrixEvent, timeoutMs = 10_000): Promise<void> {
  if (!event.isEncrypted() || event.getClearContent() != null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      event.off(MatrixEventEvent.Decrypted, done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    event.once(MatrixEventEvent.Decrypted, done);
    if (event.getClearContent() != null) done(); // decrypted between the guard and the attach
  });
}

/**
 * Block until the SDK confirms the room is Megolm-encrypted. Called after join so
 * a send can never silently downgrade to a plaintext m.room.message before the
 * m.room.encryption state event has been processed locally.
 */
export async function waitForRoomEncryption(
  client: MatrixClient,
  roomId: string,
  timeoutMs = 10_000,
): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error("rust crypto not initialised");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await crypto.isEncryptionEnabledInRoom(roomId)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`room ${roomId} never reported encryption enabled`);
}

/**
 * Whether a timeline event is a usable inbound message for this client: a real
 * room message, decrypted successfully, and not our own echo.
 */
export function isUsableMessage(client: MatrixClient, event: MatrixEvent): boolean {
  if (event.getSender() === client.getUserId()) return false; // own echo
  if (event.getType() !== "m.room.message") return false;
  if (event.isDecryptionFailure()) return false;
  return true;
}
