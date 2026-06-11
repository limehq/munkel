// Dev helper: sends an encrypted profile + chat message to a group, acting
// as a second member. Implements the PROTOCOL.md derivation/encryption in
// TypeScript — succeeding against the Swift app proves crypto interop.
//
// Usage: bun scripts/dev-send.ts <group-code> <sender-name> <text>

const [code, sender = 'Anna', text = 'Hallo aus TypeScript!'] = process.argv.slice(2);
if (!code) {
  process.stderr.write('usage: bun scripts/dev-send.ts <group-code> <sender-name> <text>\n');
  process.exit(1);
}

const encoder = new TextEncoder();
const normalized = code.normalize('NFC').trim().toLowerCase();
const salt = encoder.encode('fluesterung-v1');

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
const key = await crypto.subtle.importKey('raw', (await derive('message-key', 256)).buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);

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

const relayURL = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const memberId = process.env.MEMBER_ID ?? 'dev-sender';

process.stdout.write(`groupId: ${groupId}\n`);

const ws = new WebSocket(`${relayURL}/ws?group=${groupId}&member=${memberId}`);

ws.onmessage = (event) => {
  process.stdout.write(`<< ${event.data}\n`);
};

ws.onopen = async () => {
  ws.send(JSON.stringify({ type: 'send', payload: await seal({ kind: 'profile', displayName: sender }) }));
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
  process.stderr.write('websocket error — is the relay running? (cd server && bun run dev)\n');
  process.exit(1);
};
