import { Hono } from 'hono';
import { GroupRoom } from './group-room';
import { GROUP_ID_REGEX, MEMBER_ID_REGEX } from './protocol';
import { createLogger } from './lib/logger';

export { GroupRoom };

interface Env {
  GROUP_ROOM: DurableObjectNamespace<GroupRoom>;
}

const log = createLogger('router');

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.text('ok'));

app.get('/ws', async (c) => {
  const group = c.req.query('group') ?? '';
  if (!GROUP_ID_REGEX.test(group)) {
    return c.text('Missing or invalid group parameter', 400);
  }

  const member = c.req.query('member') ?? '';
  if (!MEMBER_ID_REGEX.test(member)) {
    return c.text('Missing or invalid member parameter', 400);
  }

  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket upgrade', 426);
  }

  log.info('ws_connect', { group, ip: c.req.header('CF-Connecting-IP') ?? 'unknown' });

  const id = c.env.GROUP_ROOM.idFromName(group);
  const stub = c.env.GROUP_ROOM.get(id);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-partykit-room', group);
  return stub.fetch(new Request(c.req.raw.url, { headers }));
});

export default app;
