// Dev helper: the image counterpart to dev-send.ts. Acts as a second member
// that can SEND an image album (seal each → PUT to the R2 blob API → relay one
// pointer) or LISTEN for one (receive pointer → GET each blob → decrypt → write
// to disk). It reimplements the protocol in TypeScript, independently of
// MunkelKit, so a successful round trip against the Swift app proves crypto +
// blob + album-schema interop. NOTE: this harness uploads the RAW source bytes;
// it is NOT an AVIF-fidelity tool. The real AVIF transcode lives in the Swift
// app (ImageCodec); to test AVIF on the wire, send from the app/CLI and let
// this client receive (the listener content-sniffs, so the mime is advisory).
//
// Usage:
//   bun scripts/dev-image.ts <group-code> <sender> <path…> [--caption <text>] [--to <memberId>]
//   bun scripts/dev-image.ts --listen <group-code> <member>
//
// Env: RELAY_URL (default ws://127.0.0.1:8787), MEMBER_ID.

import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveGroupKeys, seal, sealRaw, open as openPayload, openRaw } from '@munkel/shared-wire/crypto';
import { encodeProfile, encodeImage, decodePayload } from '@munkel/shared-wire/payload';

const MAX_IMAGES = 8; // mirrors AppPayload.maxImagesPerMessage
// Mirrors AppPayload.albumThumbBudget / perThumbBudget (TS can't import Swift).
const ALBUM_THUMB_BUDGET = 16_384;
// 1×1 transparent PNG — a valid placeholder thumb when the real image is too
// big to ride the relay frame inline (the app fetches the full one from R2).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDcdwk0AAAAAElFTkSuQmCC';

const listenMode = process.argv[2] === '--listen';
const positional = process.argv.slice(listenMode ? 3 : 2);
const [code, name = 'Alex'] = positional;

// Everything after <sender> is paths, until --caption / --to flags.
const paths: string[] = [];
let caption = '';
let directTo: string | undefined;
for (let i = 2; i < positional.length; i++) {
  const arg = positional[i]!;
  if (arg === '--caption') {
    caption = positional.slice(i + 1).filter((a) => a !== '--to' && a !== directTo).join(' ');
    const toAt = positional.indexOf('--to', i);
    if (toAt !== -1) directTo = positional[toAt + 1];
    break;
  }
  if (arg === '--to') {
    directTo = positional[i + 1];
    i++;
    continue;
  }
  paths.push(arg);
}

if (!code || (!listenMode && paths.length === 0)) {
  process.stderr.write(
    'usage: bun scripts/dev-image.ts <group-code> <sender> <path…> [--caption <text>] [--to <memberId>]\n' +
      '       bun scripts/dev-image.ts --listen <group-code> <member>\n',
  );
  process.exit(1);
}

const { groupId, messageKey } = await deriveGroupKeys(code);

const relayURL = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const memberId = process.env.MEMBER_ID ?? (listenMode ? 'dev-image-listener' : 'dev-image-sender');
const blobBase = relayURL.replace(/^ws/, 'http');

function mimeFor(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

function relayEndpoint(): string {
  const endpoint = new URL('/ws', new URL(relayURL));
  endpoint.searchParams.set('group', groupId);
  endpoint.searchParams.set('member', memberId);
  return endpoint.toString();
}

/** Detect the real format of received bytes — proves AVIF is on the wire. */
function sniff(bytes: Uint8Array): string {
  if (bytes.length >= 12) {
    const ascii = (i: number, j: number) => Buffer.from(bytes.subarray(i, j)).toString('latin1');
    if (ascii(4, 8) === 'ftyp') {
      const major = ascii(8, 12);
      return major === 'avif' || major === 'avis' ? 'AVIF' : `ftyp:${major}`;
    }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'PNG';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'JPEG';
  }
  return 'unknown';
}

process.stdout.write(`groupId: ${groupId}\nblob API: ${blobBase}/blob/${groupId}/<key>\n`);

const ws = new WebSocket(relayEndpoint());

ws.onerror = () => {
  process.stderr.write('websocket error — is the relay running? (cd apps/server && bun run dev)\n');
  process.exit(1);
};

if (listenMode) {
  ws.onmessage = async (event) => {
    const frame = JSON.parse(String(event.data));
    if (frame.type !== 'message') return;
    let payload;
    try {
      payload = decodePayload(await openPayload(frame.payload, messageKey));
    } catch {
      return;
    }
    if (payload.kind !== 'image') {
      process.stdout.write(`<< ${payload.kind} from ${frame.from}\n`);
      return;
    }
    const items = payload.items;
    const cap = payload.caption ? ` caption="${payload.caption}"` : '';
    process.stdout.write(`image album from ${frame.from}: ${items.length} image(s)${cap}\n`);
    for (const item of items) {
      const res = await fetch(`${blobBase}/blob/${groupId}/${item.r2Key}`);
      if (!res.ok) {
        process.stderr.write(`  blob GET failed for ${item.r2Key}: ${res.status}\n`);
        continue;
      }
      const full = await openRaw(new Uint8Array(await res.arrayBuffer()), messageKey);
      const fmt = sniff(full);
      const out = join(tmpdir(), `munkel-recv-${item.r2Key}.${fmt === 'AVIF' ? 'avif' : (item.mime.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')}`);
      await Bun.write(out, full);
      process.stdout.write(`  ${fmt === 'AVIF' ? '✓ AVIF' : '⚠ ' + fmt}  ${full.byteLength} bytes → ${out}\n`);
    }
  };
  ws.onopen = async () => {
    const profile = await seal(JSON.stringify(encodeProfile(name)), messageKey);
    ws.send(JSON.stringify({ type: 'send', payload: profile }));
    process.stdout.write(`listening as "${name}" (${memberId})… send an image to me from the app or another client\n`);
    setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30_000);
  };
} else {
  ws.onopen = async () => {
    const profile = await seal(JSON.stringify(encodeProfile(name)), messageKey);
    ws.send(JSON.stringify({ type: 'send', payload: profile }));

    const selected = paths.slice(0, MAX_IMAGES);
    const perThumb = Math.max(1_200, Math.floor(ALBUM_THUMB_BUDGET / selected.length));
    const items = [];
    for (const path of selected) {
      const full = new Uint8Array(await Bun.file(path).arrayBuffer());
      const sealed = await sealRaw(full, messageKey);
      const r2Key = crypto.randomUUID().replace(/-/g, '');
      const put = await fetch(`${blobBase}/blob/${groupId}/${r2Key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: sealed,
      });
      if (!put.ok) {
        process.stderr.write(`blob PUT failed for ${basename(path)}: ${put.status}\n`);
        process.exit(1);
      }
      // Reuse the file bytes as the inline thumb only when small enough to fit
      // the shared budget; otherwise a 1×1 placeholder (full loads from R2).
      const thumb = full.byteLength <= perThumb ? Buffer.from(full).toString('base64') : TINY_PNG_BASE64;
      items.push({ r2Key, mime: mimeFor(path), width: 1, height: 1, byteLen: sealed.byteLength, thumb });
      process.stdout.write(`uploaded ${sealed.byteLength} sealed bytes (${basename(path)}) → ${r2Key}\n`);
    }

    const album = encodeImage(items, caption);
    ws.send(
      JSON.stringify({
        type: 'send',
        ...(directTo ? { to: directTo } : {}),
        payload: await seal(JSON.stringify(album), messageKey),
      }),
    );
    process.stdout.write(
      `sent album of ${items.length} as "${name}"${caption ? ` caption="${caption}"` : ''}${directTo ? ` → ${directTo}` : ''}\n`,
    );
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 800);
  };
}
