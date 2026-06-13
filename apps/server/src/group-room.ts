import { Server } from 'partyserver';
import type { Connection, ConnectionContext, WSMessage } from 'partyserver';
import { clientMessageSchema, MEMBER_ID_REGEX } from './protocol';
import type { ErrorCode, ServerMessage } from './protocol';
import { createLogger } from './lib/logger';

const MAX_CONNECTIONS_PER_GROUP = 32;
const STALE_TIMEOUT_MS = 120_000;

const log = createLogger('group');

interface Attachment {
  memberId: string;
  lastSeen: number;
}

/**
 * One Durable Object per group. A WebSocket connection IS a group
 * membership — presence derives from live connections, nothing is stored.
 */
export class GroupRoom extends Server {
  static options = { hibernate: true };

  private get groupId(): string {
    return this.ctx.id.name ?? 'unknown';
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader?.toLowerCase() === 'websocket') {
      const count = this.ctx.getWebSockets().length;
      if (count >= MAX_CONNECTIONS_PER_GROUP) {
        log.warn('connection_limit_exceeded', { groupId: this.groupId, count, max: MAX_CONNECTIONS_PER_GROUP });
        return new Response('Too many connections', { status: 503 });
      }
    }
    return super.fetch(request);
  }

  onConnect(connection: Connection, ctx: ConnectionContext): void {
    const memberId = new URL(ctx.request.url).searchParams.get('member') ?? '';
    if (!MEMBER_ID_REGEX.test(memberId)) {
      connection.close(1008, 'invalid member id');
      return;
    }

    const alreadyPresent = this.findConnections(memberId, connection.id).length > 0;

    // A reconnect replaces the previous connection of the same member.
    for (const stale of this.findConnections(memberId, connection.id)) {
      try {
        stale.close(1000, 'replaced by new connection');
      } catch {
      }
    }

    connection.setState({ memberId, lastSeen: Date.now() } satisfies Attachment);

    this.sendTo(connection, { type: 'welcome', members: this.membersExcept(memberId) });
    if (!alreadyPresent) {
      this.broadcastMessage({ type: 'peer-joined', memberId }, [connection.id]);
    }

    log.info('member_connected', { groupId: this.groupId, memberId, reconnect: alreadyPresent });
    void this.ctx.storage.setAlarm(Date.now() + STALE_TIMEOUT_MS);
  }

  onMessage(connection: Connection, message: WSMessage): void {
    const attachment = connection.state as Attachment | null;
    if (!attachment) {
      connection.close(1008, 'not identified');
      return;
    }
    connection.setState({ ...attachment, lastSeen: Date.now() } satisfies Attachment);

    if (typeof message !== 'string') {
      this.sendError(connection, 'invalid-message', 'Binary frames are not supported');
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(message);
    } catch {
      this.sendError(connection, 'invalid-message', 'Frame is not valid JSON');
      return;
    }

    const parsed = clientMessageSchema.safeParse(json);
    if (!parsed.success) {
      this.sendError(connection, 'invalid-message', 'Frame does not match protocol');
      return;
    }

    switch (parsed.data.type) {
      case 'ping':
        this.sendTo(connection, { type: 'pong' });
        return;
      case 'send':
        this.relay(connection, attachment.memberId, parsed.data.payload, parsed.data.to);
        return;
    }
  }

  onClose(connection: Connection): void {
    this.handleDisconnect(connection, 'member_disconnected');
  }

  onError(connection: Connection): void {
    this.handleDisconnect(connection, 'connection_error');
  }

  async onAlarm(): Promise<void> {
    const now = Date.now();
    let closedCount = 0;
    for (const conn of this.getConnections()) {
      const attachment = conn.state as Attachment | null;
      const lastSeen = attachment?.lastSeen ?? 0;
      if (now - lastSeen > STALE_TIMEOUT_MS) {
        try {
          conn.close(1000, 'stale');
          closedCount++;
        } catch {
        }
      }
    }
    if (closedCount > 0) {
      log.info('stale_connections_closed', { groupId: this.groupId, count: closedCount });
    }
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + STALE_TIMEOUT_MS);
    }
  }

  private relay(connection: Connection, from: string, payload: string, to?: string): void {
    if (to) {
      const targets = this.findConnections(to);
      if (targets.length === 0) {
        this.sendError(connection, 'unknown-recipient', `No member "${to}" in this group`);
        return;
      }
      const frame: ServerMessage = { type: 'message', from, to, payload };
      for (const target of targets) {
        target.send(JSON.stringify(frame));
      }
      log.debug('message_relayed', { groupId: this.groupId, direct: true, bytes: payload.length });
      return;
    }

    this.broadcastMessage({ type: 'message', from, payload }, [connection.id]);
    log.debug('message_relayed', { groupId: this.groupId, direct: false, bytes: payload.length });
  }

  private handleDisconnect(connection: Connection, event: string): void {
    const attachment = connection.state as Attachment | null;
    if (!attachment) {
      return;
    }
    // Only announce the leave when no other connection of this member remains
    // (i.e. not when a reconnect just replaced this connection).
    if (this.findConnections(attachment.memberId, connection.id).length === 0) {
      this.broadcastMessage({ type: 'peer-left', memberId: attachment.memberId }, [connection.id]);
    }
    log.info(event, { groupId: this.groupId, memberId: attachment.memberId });
  }

  private findConnections(memberId: string, excludeConnectionId?: string): Connection[] {
    const matches: Connection[] = [];
    for (const conn of this.getConnections()) {
      if (conn.id === excludeConnectionId) continue;
      const attachment = conn.state as Attachment | null;
      if (attachment?.memberId === memberId) {
        matches.push(conn);
      }
    }
    return matches;
  }

  private membersExcept(memberId: string): string[] {
    const members = new Set<string>();
    for (const conn of this.getConnections()) {
      const attachment = conn.state as Attachment | null;
      if (attachment && attachment.memberId !== memberId) {
        members.add(attachment.memberId);
      }
    }
    return [...members];
  }

  private sendTo(connection: Connection, message: ServerMessage): void {
    connection.send(JSON.stringify(message));
  }

  private broadcastMessage(message: ServerMessage, without: string[] = []): void {
    this.broadcast(JSON.stringify(message), without);
  }

  private sendError(connection: Connection, code: ErrorCode, message: string): void {
    this.sendTo(connection, { type: 'error', code, message });
  }
}
