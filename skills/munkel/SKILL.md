---
name: munkel
description: Send ephemeral end-to-end-encrypted messages that appear in
  friends' MacBook notches, via the munkel CLI (macOS). Use when the user
  wants to message, ping, or notify someone in a Munkel circle, broadcast
  to a circle, or list Munkel circles and members.
---

# munkel — munkel into your friends' notches

Ephemeral, E2E-encrypted messages that slide out of the recipient's MacBook
notch. The CLI is **send-only** — a thin client for the running Munkel.app,
which owns circles, crypto, and the relay. It auto-launches the app if it
isn't running, so no `open -a Munkel` first.

## Notify one person — the common case

```sh
munkel dm <name> <message…>      # e.g. munkel dm sebil deploy is green
```

`dm` resolves `<name>` across every circle, so this is a **single call** — do
NOT run `munkel circles` first. `<name>` matches a member's display name
(case-insensitive) or a prefix of their key id (both shown by `munkel
circles`). Success prints `munkeled ✓` and exits 0.

If the send fails, the error says which case it is: an unknown name prints
`No online member matches …`; a name in more than one circle prints the
candidate circles. Either way, retry with the circle-scoped form:

```sh
munkel <circle> <name> <message…>    # munkel blue-table-42 sebil hi
munkel <circle> all <message…>       # broadcast to the whole circle
```

`<circle>` is a code like `blue-table-42`; any unambiguous prefix works.
Broadcast (`all`) always needs an explicit circle.

## List circles (only when a send fails)

```sh
munkel circles            # ● online / ○ offline, with online members
munkel circles --json     # machine-readable [{code,connected,members}]
```

## Limits

- Send-only: no way to read replies or history.
- Messages are ephemeral — nothing is stored anywhere. A success means the
  message was handed to the relay, not that it appeared in their notch. Don't
  use Munkel for notifications the user must not miss.

Run `munkel --help` for socket overrides (`MUNKEL_SOCKET`), dev mode, and exit
codes (64 usage · 75 app didn't reply).
