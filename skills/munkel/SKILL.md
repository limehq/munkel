---
name: munkel
description: Send ephemeral end-to-end-encrypted messages that appear in
  friends' MacBook notches, via the munkel CLI (macOS). Use when the user
  wants to message, ping, or notify someone in a Munkel circle, broadcast
  to a circle, or list Munkel circles and members.
---

# munkel — whisper into your friends' notches

Munkel delivers ephemeral E2E-encrypted messages that slide out of the
recipient's MacBook notch. The CLI is **send-only**: it cannot read,
receive, or wait for messages. It is a thin client for the running
Munkel.app, which owns circles, crypto, and the relay connection.

## Requirements

- macOS with Munkel.app installed and **running**:
  `brew install limehq/tap/munkel`, then `open -a Munkel`.
- The user must already be in a circle — circles are created/joined in the
  app's menu-bar UI, not the CLI.

## Commands

```sh
munkel circles                       # list circles and online members
munkel <circle> <recipient> <text…>  # direct message (recipient = display name)
munkel <circle> all <text…>          # broadcast to the whole circle
```

- `<circle>` is a circle code like `blue-table-42`; any unambiguous
  prefix works (`blue-table` suffices if only one circle starts with it).
- `<recipient>` is a member's display name exactly as shown by
  `munkel circles`; `all` broadcasts.
- Everything after the recipient is joined with spaces, so quoting is
  only needed for shell metacharacters.

`munkel circles` output (● = relay-connected, ○ = offline; members shown
are the ones currently online):

```
● blue-table-42  —  Alex, Sam
```

Run `munkel circles` first to discover valid circle codes and recipient
names.

## Behavior and errors

Success prints `whispered ✓` and exits 0.

- `Munkel app isn't running` — the app is not running; launch it with
  `open -a Munkel` (or ask the user to).
- Unknown circle / recipient errors come from the app; re-check with
  `munkel circles`.
- Exit 64 means a usage error (wrong arguments).
- `MUNKEL_SOCKET` overrides the control socket path
  (default `~/Library/Application Support/Munkel/control.sock`) — only
  relevant for testing.

## Limits

- Send-only: there is no way to read replies or message history.
- Messages are ephemeral by design — nothing is stored anywhere. Do not
  use Munkel for notifications the user must not miss.
