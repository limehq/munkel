// Dev helper: sends an encrypted profile + chat message to a group, acting
// as a second member. Implements the protocol derivation/encryption (spec:
// ../src/protocol.ts) in TypeScript independently of MunkelKit — succeeding
// against the Swift app proves crypto interop.
//
// Usage: bun scripts/dev-send.ts <group-code> <sender-name> <text>
//        bun scripts/dev-send.ts --listen <group-code> <sender-name>
//        (stays connected and prints decrypted incoming messages)
//
// Set TO=<memberId> to direct the chat at a single member (a "whisper")
// instead of broadcasting to the whole group; unset means broadcast.

const listenMode = process.argv[2] === '--listen';
const positional = process.argv.slice(listenMode ? 3 : 2);
const [code, sender = 'Alex', text = 'Hello from TypeScript!'] = positional;
if (!code) {
  process.stderr.write('usage: bun scripts/dev-send.ts [--listen] <group-code> <sender-name> [text]\n');
  process.exit(1);
}

const encoder = new TextEncoder();
const normalized = code.normalize('NFC').trim().toLowerCase();
const salt = encoder.encode('munkel-v1');

const ikm = await crypto.subtle.importKey('raw', encoder.encode(normalized), 'HKDF', false, ['deriveBits']);

async function derive(info: string, bits: number): Promise<Uint8Array> {
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(info) },
    ikm,
    bits,
  );
  return new Uint8Array(derived);
}

const groupId = [...await derive('group-id', 128)].map((b) => b.toString(16).padStart(2, '0')).join('');
const key = await crypto.subtle.importKey(
  'raw',
  (await derive('message-key', 256)).buffer as ArrayBuffer,
  'AES-GCM',
  false,
  ['encrypt', 'decrypt'],
);

async function seal(payload: Record<string, unknown>): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, encoder.encode(JSON.stringify(payload))),
  );
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return Buffer.from(combined).toString('base64');
}

// Inverse of seal(). Deliberately not named `open`: that shadows the
// window.open global and trips CodeQL's open-redirect heuristic (CWE-601).
async function unseal(payload: string): Promise<unknown> {
  const combined = Buffer.from(payload, 'base64');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.subarray(0, 12) },
    key,
    combined.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function relayEndpoint(raw: string, group: string, member: string): string {
  const base = new URL(raw);
  if (base.protocol !== 'ws:' && base.protocol !== 'wss:') {
    throw new Error('RELAY_URL must use ws:// or wss://');
  }
  if (base.username || base.password) {
    throw new Error('RELAY_URL must not include credentials');
  }

  const endpoint = new URL('/ws', base);
  endpoint.searchParams.set('group', group);
  endpoint.searchParams.set('member', member);
  endpoint.hash = '';
  return endpoint.toString();
}

function safeLog(value: unknown): string {
  const rendered = typeof value === 'string' ? value : JSON.stringify(value);
  return (rendered ?? String(value)).replace(
    /[\u001b\u009b][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]/g,
    '',
  );
}

const relayURL = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const memberId = process.env.MEMBER_ID ?? 'dev-sender';

process.stdout.write(`groupId: ${groupId}\n`);

const ws = new WebSocket(relayEndpoint(relayURL, groupId, memberId));

ws.onmessage = async (event) => {
  const frame = JSON.parse(String(event.data));
  if (listenMode && frame.type === 'message') {
    const decrypted = await unseal(frame.payload);
    process.stdout.write(`DECRYPTED from=${safeLog(frame.from)} to=${safeLog(frame.to ?? 'all')}: ${safeLog(decrypted)}\n`);
    return;
  }
  process.stdout.write(`<< ${safeLog(event.data)}\n`);
};

ws.onopen = async () => {
  ws.send(JSON.stringify({ type: 'send', payload: await seal({ kind: 'profile', displayName: sender, status: 'online' }) }));
  if (listenMode) {
    process.stdout.write(`listening as "${sender}" (${memberId})…\n`);
    setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30_000);
    return;
  }
  const to = process.env.TO;
  ws.send(JSON.stringify({
    type: 'send',
    ...(to ? { to } : {}),
    payload: await seal({ kind: 'chat', text, sentAt: new Date().toISOString() }),
  }));
  process.stdout.write(`sent profile + chat as "${sender}"${to ? ` → ${to}` : ''}\n`);
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 600);
};

ws.onerror = () => {
  process.stderr.write('websocket error — is the relay running? (cd apps/server && bun run dev)\n');
  process.exit(1);
};
