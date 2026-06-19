import net from 'node:net';
import type { ControlRequest, ControlResponse } from './control.js';

export class TransportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TransportError';
    this.cause = cause;
  }
}

function sanitizePath(path: string): string {
  // Windows named pipes look like \\.\pipe\Name; strip accidental whitespace.
  return path.trim();
}

/**
 * Create a named-pipe server for the Munkel control protocol.
 *
 * Each connection expects exactly one line of JSON (a {@link ControlRequest})
 * and receives one line of JSON (a {@link ControlResponse}) before the server
 * closes the connection.
 */
export function createControlServer(
  pipeName: string,
  handler: (request: ControlRequest) => Promise<ControlResponse>,
): Promise<{ close(): Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');

      socket.on('data', async (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) return;

        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        let response: ControlResponse;
        try {
          const request = JSON.parse(line) as ControlRequest;
          response = await handler(request);
        } catch (err) {
          response = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }

        socket.write(`${JSON.stringify(response)}\n`, () => {
          socket.end();
        });
      });

      socket.on('error', () => {
        socket.destroy();
      });
    });

    server.on('error', (err) => {
      reject(new TransportError(`Failed to start control server on ${pipeName}`, err));
    });

    server.listen(sanitizePath(pipeName), () => {
      resolve({
        close() {
          return new Promise<void>((resolveClose) => {
            server.close(() => resolveClose());
          });
        },
      });
    });
  });
}

/**
 * Connect to a Munkel control server over a Windows named pipe.
 *
 * The control protocol is one request/response per connection, so every call
 * to `request` opens a fresh named-pipe connection and closes it after the
 * response line arrives.
 */
export function createControlClient(pipeName: string): Promise<{
  request(req: ControlRequest): Promise<ControlResponse>;
  close(): Promise<void>;
}> {
  const path = sanitizePath(pipeName);

  function request(req: ControlRequest): Promise<ControlResponse> {
    return new Promise((resolveRequest, rejectRequest) => {
      let settled = false;
      let buffer = '';

      const socket = net.createConnection(path, () => {
        socket.setEncoding('utf8');
        socket.write(`${JSON.stringify(req)}\n`);
      });

      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) return;
        if (settled) return;
        settled = true;

        const line = buffer.slice(0, newlineIndex).trim();
        socket.end();
        try {
          resolveRequest(JSON.parse(line) as ControlResponse);
        } catch (err) {
          rejectRequest(new TransportError('Server returned invalid JSON', err));
        }
      });

      socket.on('error', (err) => {
        if (settled) return;
        settled = true;
        rejectRequest(new TransportError(`Control request failed on ${pipeName}`, err));
      });

      socket.on('close', () => {
        if (settled) return;
        settled = true;
        rejectRequest(new TransportError('Connection closed before response'));
      });
    });
  }

  return Promise.resolve({
    request,
    close() {
      return Promise.resolve();
    },
  });
}
