// Dev helper: sends an encrypted profile + chat message to a group, acting
// as a second member. Implements the protocol derivation/encryption (spec:
// ../src/protocol.ts) in TypeScript independently of MunkelKit — succeeding
// against the Swift app proves crypto interop.
//
// Usage: bun scripts/dev-send.ts <group-code> <sender-name> <text>
//        bun scripts/dev-send.ts --listen <group-code> <sender-name>
//        (stays connected and prints decrypted incoming messages)

const listenMode = process.argv[2] === '--listen';
const positional = process.argv.slice(listenMode ? 3 : 2);
const [code, sender = 'Anna', text = 'Hallo aus TypeScript!'] = positional;
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

async function open(payload: string): Promise<unknown> {
  const combined = Buffer.from(payload, 'base64');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.subarray(0, 12) },
    key,
    combined.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

const relayURL = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const memberId = process.env.MEMBER_ID ?? 'dev-sender';

process.stdout.write(`groupId: ${groupId}\n`);

const ws = new WebSocket(`${relayURL}/ws?group=${groupId}&member=${memberId}`);

ws.onmessage = async (event) => {
  const frame = JSON.parse(String(event.data));
  if (listenMode && frame.type === 'message') {
    const decrypted = await open(frame.payload);
    process.stdout.write(`DECRYPTED from=${frame.from} to=${frame.to ?? 'all'}: ${JSON.stringify(decrypted)}\n`);
    return;
  }
  process.stdout.write(`<< ${event.data}\n`);
};

ws.onopen = async () => {
  ws.send(JSON.stringify({ type: 'send', payload: await seal({ kind: 'profile', displayName: sender }) }));
  if (listenMode) {
    process.stdout.write(`listening as "${sender}" (${memberId})…\n`);
    setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30_000);
    return;
  }
  ws.send(JSON.stringify({
    type: 'send',
    payload: await seal({ kind: 'chat', text, sentAt: new Date().toISOString() }),
  }));
  process.stdout.write(`sent profile + chat as "${sender}"\n`);
  setTimeout(() => {
    ws.close();
    process.exit(0);
  }, 600);
};

ws.onerror = () => {
  process.stderr.write('websocket error — is the relay running? (cd apps/server && bun run dev)\n');
  process.exit(1);
};
