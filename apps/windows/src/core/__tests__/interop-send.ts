// Dev helper equivalent to apps/server/scripts/dev-send.ts, but built on
// ../core. It proves that this package produces payloads the server
// reference script can decrypt.
//
// Usage from repo root:
//   bun packages/munkel-core/test/interop-send.ts <group-code> <sender-name> [text]
//
// Set RELAY_URL, MEMBER_ID, and TO env vars as in dev-send.ts.

import { deriveGroupKeys, seal } from '../crypto';
import { encodeChat, encodeProfile } from '../payload';

const listenMode = process.argv[2] === '--listen';
const positional = process.argv.slice(listenMode ? 3 : 2);
const [code, sender = 'CoreSender', text = 'Hello from ../core!'] = positional;

if (!code) {
  process.stderr.write('usage: bun interop-send.ts [--listen] <group-code> <sender-name> [text]\n');
  process.exit(1);
}

const { groupId, messageKey } = await deriveGroupKeys(code);
process.stdout.write(`groupId: ${groupId}\n`);

const relayURL = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const memberId = process.env.MEMBER_ID ?? 'core-sender';

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

const ws = new WebSocket(relayEndpoint(relayURL, groupId, memberId));

ws.onopen = async () => {
  const profile = await seal(JSON.stringify(encodeProfile(sender)), messageKey);
  ws.send(JSON.stringify({ type: 'send', payload: profile }));

  if (listenMode) {
    process.stdout.write(`listening as "${sender}" (${memberId})…\n`);
    setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30_000);
    return;
  }

  const to = process.env.TO;
  const chat = await seal(JSON.stringify(encodeChat(text)), messageKey);
  ws.send(JSON.stringify({ type: 'send', ...(to ? { to } : {}), payload: chat }));
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
