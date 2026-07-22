---
name: munkel
description: Send ephemeral end-to-end-encrypted messages that appear in
  friends' MacBook notches, via the munkel CLI (macOS). Use when the user
  wants to message, ping, or notify someone in a Munkel channel, broadcast
  to a channel, or list Munkel channels and members.
---

# munkel — munkel into your friends' notches

Ephemeral, E2E-encrypted messages that slide out of the recipient's MacBook
notch. The CLI is **send-only** — a thin client for the running Munkel.app,
which owns channels, crypto, and the relay. It auto-launches the app if it
isn't running, so no `open -a Munkel` first.

## Notify one person — the common case

```sh
munkel dm <name> <message…>      # e.g. munkel dm sebil deploy is green
```

`dm` resolves `<name>` across every channel, so this is a **single call** — do
NOT run `munkel channels` first. `<name>` matches a member's display name
(case-insensitive) or a prefix of their key id (both shown by `munkel
channels`). Success prints `munkeled ✓` and exits 0.

If the send fails, the error says which case it is: an unknown name prints
`No online member matches …`; a name in more than one channel prints the
candidate channels. Either way, retry with the channel-scoped form:

```sh
munkel <channel> <name> <message…>    # munkel blue-table-42 sebil hi
munkel <channel> all <message…>       # broadcast to the whole channel
```

`<channel>` is a code like `blue-table-42`; any unambiguous prefix works.
Broadcast (`all`) always needs an explicit channel. If you can't tell which
channel is the right one, ask — don't send to every candidate, or you'll notify
the wrong people too.

## List channels (only when a send fails)

```sh
munkel channels            # ● online / ○ offline, with online members
munkel channels --json     # machine-readable [{code,connected,members}]
```

## Limits

- Send-only: no way to read replies or history.
- Messages are ephemeral — nothing is stored anywhere. A success means the
  message was handed to the relay, not that it appeared in their notch. Don't
  use Munkel for notifications the user must not miss.

Run `munkel --help` for socket overrides (`MUNKEL_SOCKET`), dev mode, and exit
codes (64 usage · 75 app didn't reply).
