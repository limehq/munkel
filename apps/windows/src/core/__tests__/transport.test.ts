import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createControlServer, createControlClient } from '../transport';
import { buildPipeName } from '../control';
import type { ControlRequest, ControlResponse } from '../control';

describe('named-pipe transport', () => {
  let pipeName: string;
  let server: { close(): Promise<void> };
  let client: { request(req: ControlRequest): Promise<ControlResponse>; close(): Promise<void> };

  beforeEach(async () => {
    pipeName = buildPipeName(`test-${Date.now()}`);
    server = await createControlServer(pipeName, async (req) => {
      if (req.action === 'echo') {
        return { ok: true, groups: [{ code: req.group ?? 'none', connected: true, members: [] }] };
      }
      if (req.action === 'error') {
        throw new Error('intentional test error');
      }
      return { ok: true };
    });
    client = await createControlClient(pipeName);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('round-trips a request/response over the named pipe', async () => {
    const response = await client.request({ action: 'echo', group: 'blue-table-42' });
    expect(response.ok).toBe(true);
    expect(response.groups).toEqual([{ code: 'blue-table-42', connected: true, members: [] }]);
  });

  it('surfaces handler errors as failed responses', async () => {
    const response = await client.request({ action: 'error' });
    expect(response.ok).toBe(false);
    expect(response.error).toBe('intentional test error');
  });
});
