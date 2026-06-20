// Image blobs over Matrix media. The Swift app already AES-seals each full-res
// image before upload (BlobClient), so we store OPAQUE ciphertext via the Matrix
// media repo and never apply Matrix attachment encryption on top — the bytes are
// already unreadable to the homeserver.
//
// Munkel addresses blobs by (group, key): the SENDER PUTs /blob/<group>/<key>,
// a DIFFERENT member later GETs the same path (the key travels inside the
// encrypted image pointer). Sender and receiver are different gateway sessions,
// so the (group,key) -> mxc map must live at GATEWAY scope, shared across sessions.
import type { MatrixClient } from "matrix-js-sdk";

export interface BlobRef {
  mxc: string;
}

/** Gateway-scoped (group,key) -> mxc index, shared by every session. */
export interface BlobIndex {
  get(group: string, key: string): BlobRef | undefined;
  put(group: string, key: string, ref: BlobRef): void;
}

export class InMemoryBlobIndex implements BlobIndex {
  private readonly map = new Map<string, BlobRef>();
  private k(group: string, key: string): string {
    return `${group}/${key}`;
  }
  get(group: string, key: string): BlobRef | undefined {
    return this.map.get(this.k(group, key));
  }
  put(group: string, key: string, ref: BlobRef): void {
    this.map.set(this.k(group, key), ref);
  }
}

/** Single source of truth for the blob cap — matches apps/server/src/blob.ts. */
export const MAX_BLOB_BYTES = 3 * 1024 * 1024;

/** Upload already-sealed ciphertext to Matrix media; remember the mxc. */
export async function putBlob(
  client: MatrixClient,
  index: BlobIndex,
  group: string,
  key: string,
  ciphertext: Uint8Array,
): Promise<BlobRef> {
  const { content_uri } = await client.uploadContent(ciphertext, {
    type: "application/octet-stream", // opaque — real mimetype lives in the encrypted pointer
    name: `${key}.bin`,
    includeFilename: false,
  });
  const ref: BlobRef = { mxc: content_uri };
  index.put(group, key, ref);
  return ref;
}

/** Fetch + return the sealed ciphertext for a known blob ref (authenticated media). */
export async function getBlob(client: MatrixClient, ref: BlobRef): Promise<Uint8Array> {
  const httpUrl = client.mxcUrlToHttp(
    ref.mxc,
    undefined, // width
    undefined, // height
    undefined, // resizeMethod
    false, // allowDirectLinks
    true, // allowRedirects
    true, // useAuthentication -> /_matrix/client/v1/media/download/...
  );
  if (!httpUrl) throw new Error(`cannot resolve mxc: ${ref.mxc}`);
  const res = await fetch(httpUrl, {
    headers: { Authorization: `Bearer ${client.getAccessToken()}` },
  });
  if (!res.ok) throw new Error(`media download ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BLOB_BYTES) throw new Error("blob exceeds cap");
  return buf;
}

export function resolveBlob(index: BlobIndex, group: string, key: string): BlobRef | undefined {
  return index.get(group, key);
}
