# @munkel/shared-wire

Shared wire-format types and constants for the Munkel CLI, Windows app, and relay server.

- `control.ts` / `transport.ts` — local IPC contract (named pipe / Unix socket).
- `protocol.ts` — relay WebSocket message schema.
- `wire-constants.ts` — caps and regexes that must stay in sync across clients and server.
- `PROTOCOL.md` — canonical prose spec for the Munkel wire protocol v1.
