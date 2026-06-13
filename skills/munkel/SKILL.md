---
name: munkel
description: Send ephemeral end-to-end-encrypted messages that appear in
  friends' MacBook notches, via the munkel CLI (macOS). Use when the user
  wants to message, ping, or notify someone in a Munkel group, broadcast
  to a group, or list Munkel groups and members.
---

# munkel — whisper into your friends' notches

Munkel delivers ephemeral E2E-encrypted messages that slide out of the
recipient's MacBook notch. The CLI is **send-only**: it cannot read,
receive, or wait for messages. It is a thin client for the running
Munkel.app, which owns groups, crypto, and the relay connection.

## Requirements

- macOS with Munkel.app installed and **running**:
  `brew install limehq/tap/munkel`, then `open -a Munkel`.
- The user must already be in a group — groups are created/joined in the
  app's menu-bar UI, not the CLI.

## Commands

```sh
munkel groups                        # list groups and online members
munkel <group> <recipient> <text…>   # direct message (recipient = display name)
munkel <group> all <text…>           # broadcast to the whole group
```

- `<group>` is a group code like `kaffee-falke-42`; any unambiguous
  prefix works (`kaffee` suffices if only one group starts with it).
- `<recipient>` is a member's display name exactly as shown by
  `munkel groups`; `all` broadcasts.
- Everything after the recipient is joined with spaces, so quoting is
  only needed for shell metacharacters.

`munkel groups` output (● = relay-connected, ○ = offline; members shown
are the ones currently online):

```
● kaffee-falke-42  —  Anna, Ben
```

Run `munkel groups` first to discover valid group codes and recipient
names.

## Behavior and errors

CLI output is German. Success prints `geflüstert ✓` and exits 0.

- `Munkel-App läuft nicht` — the app is not running; launch it with
  `open -a Munkel` (or ask the user to).
- Unknown group / recipient errors come from the app; re-check with
  `munkel groups`.
- Exit 64 means a usage error (wrong arguments).
- `MUNKEL_SOCKET` overrides the control socket path
  (default `~/Library/Application Support/Munkel/control.sock`) — only
  relevant for testing.

## Limits

- Send-only: there is no way to read replies or message history.
- Messages are ephemeral by design — nothing is stored anywhere. Do not
  use Munkel for notifications the user must not miss.
