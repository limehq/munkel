/**
 * Re-encodes avatars for the encrypted profile payload and decodes incoming
 * ones. This mirrors the macOS AvatarCodec interface; the v1 implementation
 * is intentionally small and dependency-free so that a production image
 * library (e.g. sharp, canvas, or a native Electron module) can be plugged
 * in later without changing the API contract.
 */

/** Raw-byte budget for outgoing avatars. See AvatarCodec.swift. */
export const MAX_AVATAR_BYTES = 20_480;
/** Longest side for decoded avatars; prevents tiny JPEGs from declaring huge dimensions. */
export const MAX_DECODED_PIXELS = 256;

export interface ImageData {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface AvatarCodec {
  encode(imageData: Uint8Array): Promise<Uint8Array>;
  decode(imageData: Uint8Array): Promise<ImageData | null>;
}

class PassthroughAvatarCodec implements AvatarCodec {
  async encode(imageData: Uint8Array): Promise<Uint8Array> {
    if (imageData.length > MAX_AVATAR_BYTES) {
      throw new Error(`Avatar exceeds ${MAX_AVATAR_BYTES} bytes`);
    }
    // v1: passthrough. A real codec would downsample and re-encode as JPEG.
    return imageData;
  }

  async decode(imageData: Uint8Array): Promise<ImageData | null> {
    if (imageData.length === 0) {
      return null;
    }
    // v1: return a single opaque placeholder pixel. A real codec would use
    // an image library to produce RGBA pixel data capped at MAX_DECODED_PIXELS.
    return { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]) };
  }
}

/** Default v1 codec — safe passthrough that only enforces byte budgets. */
export const avatarCodec: AvatarCodec = new PassthroughAvatarCodec();

/** Factory for the default v1 codec. */
export function createAvatarCodec(): AvatarCodec {
  return new PassthroughAvatarCodec();
}
