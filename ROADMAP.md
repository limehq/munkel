# Roadmap

This roadmap describes what Munkel intends to do — and intends *not* to do —
over roughly the next year (2026 H2 through 2027 H1). It exists so that users,
contributors, and downstream packagers can see where the project is heading and
whether a given idea is in scope before they invest effort.

Munkel is ephemeral, end-to-end-encrypted messages between friends ("channels")
that slide out of the MacBook notch: no accounts, no message history, no message
storage. The roadmap below is grounded in the project's current state — the
shipped work in [CHANGELOG.md](CHANGELOG.md), the security model in
[README.md](README.md) and [SECURITY.md](SECURITY.md), and the explicitly
deferred items recorded in the code (for example, pairwise direct-message keys
are marked as deferred to protocol v2 in `apps/server/src/protocol.ts`).

**This roadmap is a statement of intent, not a commitment.** Priorities,
ordering, and scope are subject to change as we learn from real use. Dates are
intentionally given as horizons ("Now", "Next", "Later") and half-year windows
rather than exact calendar dates. Time-sensitive specifics live in GitHub
issues and milestones, which take precedence over this document when they
disagree.

## Now (next ~3 months)

Hardening the foundations of the current product and the things people touch
every day.

- **Harden the channel-code / invite format.** Generated channel codes are
  documented today as convenience-grade shared secrets (see
  [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md)). The near-term goal
  is a stronger, still human-shareable invite path — for example higher-entropy
  generated codes and/or an invite link/QR alternative for the create-and-share
  flow — without forcing users to read out long random strings at a café table.
  This is the single most-referenced limitation in our own docs and is the
  priority for this window.
- **Notch UX polish.** The notch presentation is the product, and it is where
  most recent work has landed (unread indicators, per-message and per-image
  copy controls, the quick-send palette, keyboard shortcuts). Continue
  tightening interaction details: hover/expand behavior, copy affordances,
  reply ergonomics, the no-notch floating-panel fallback, and keyboard
  navigation.
- **Image-sharing maturation.** Inline AVIF preview with lazy full-resolution
  fetch from R2 shipped in 0.10.0. Follow-through here means edge-case
  robustness: failed/slow blob fetches, the ~66 s blob TTL interacting with
  offline recipients, multi-image (1–8 item) layouts in the notch, and clear
  feedback when a full-res image is no longer retrievable.
- **Relay reliability basics.** Shore up reconnect behavior, idle-timeout
  handling, and the per-group connection cap (32) so that flaky networks and
  café Wi-Fi degrade gracefully rather than silently dropping messages.
- **Documentation follow-through.** Keep the governance, security, and
  architecture docs current as the project formalizes —
  [GOVERNANCE.md](GOVERNANCE.md), [MAINTAINERS.md](MAINTAINERS.md),
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and this roadmap — and keep them
  honest about what is and is not implemented.

## Next (3–9 months)

Larger pieces that change the protocol or the user model, plus accessibility
and internationalization groundwork.

- **Pairwise-encrypted direct messages.** Direct messages in v1 are
  relay-targeted but share the channel's message key; pairwise keys are
  explicitly deferred to v2 in `apps/server/src/protocol.ts` and called out in
  [SECURITY.md](SECURITY.md). The intent is that a direct message becomes
  readable only by its intended recipient, not by every current channel member
  who knows the code. This is a wire-protocol change and will be versioned and
  documented as such.
- **Forward secrecy (investigation, then design).** Once pairwise keys exist,
  evaluate adding forward secrecy so that compromise of a current key does not
  retroactively expose past messages. Given the ephemeral, no-history design,
  this is a deliberate study item first — we will publish the threat-model
  reasoning before committing to a key-ratcheting scheme.
- **Relay observability.** Add the minimum operational visibility needed to run
  the relay responsibly — error rates, connection health, blob-sweep behavior —
  while preserving the design property that the relay sees only derived group
  IDs, member IDs, sizes, and timing, and never message content. Observability
  must not become a back door to message data or a metadata store.
- **Accessibility.** Make the notch and menu-bar surfaces work well with
  VoiceOver and keyboard-only operation, and document the result in
  [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md). Note the inherent constraint:
  capture-proof surfaces (`NSWindow.sharingType = .none`) and the no-tooltip
  rule in notch content shape what is possible, and accessibility work must
  respect the capture-exclusion guarantee.
- **Internationalization groundwork.** The macOS app currently ships
  English-only strings with no localization layer. Lay the i18n foundation
  (externalize user-facing strings, establish a localization workflow) and
  record the approach in [docs/INTERNATIONALIZATION.md](docs/INTERNATIONALIZATION.md).
  Product copy stays English by default; this is about enabling translation,
  not committing to a specific set of locales.

## Later (9–12+ months)

Directionally intended, lower certainty, and most subject to change.

- **Shipping pairwise/forward-secret messaging.** Move the v2 protocol work
  above from design to a shipped, documented, interop-tested release across the
  Swift app, the relay, and the reference TypeScript sender.
- **Invite-format v2 at rest.** Build on the near-term invite hardening with a
  more complete sharing story (e.g. revocation/rotation semantics for a channel)
  if real usage shows it is needed.
- **Deeper agent / CLI ergonomics.** The `munkel` CLI and the
  `skills/munkel/SKILL.md` agent skill are send-only by design. Later work may
  refine the scripting surface and resolution behavior, while keeping the
  send-only posture.
- **Broader translations.** If and only if the i18n groundwork lands and there
  is demand, add real translated locales.

## Non-goals / Out of scope

These define Munkel's identity as much as the roadmap above. They are choices,
not missing features, and we do not intend to pursue them for the foreseeable
future.

- **No message history or storage.** Ephemerality is enforced by design: one
  Durable Object per channel with no DO storage, and image blobs expire on a
  short (~66 s) TTL swept by cron. We will not add server-side message history,
  a searchable archive, sync-across-devices of past messages, or message
  backup. Offline means missed, on purpose.
- **No accounts.** A channel is born from a shared human-readable code, which is
  the only credential and never leaves the clients. We will not add account
  registration, passwords, server-side identity, or a contact directory.
  GitHub login remains display-only identity, not authentication of peers.
- **Not a general-purpose chat app.** Munkel is a notch-first, lightweight
  "ping a friend" tool, not a Slack/Discord/iMessage replacement. We do not
  intend to build threads, channels with roles/permissions, reactions feeds,
  read receipts as a feature surface, large group management, bots/integrations
  marketplaces, or a full chat window UI. The notch and menu-bar surfaces are
  the product.
- **Not for high-risk secret sharing.** Munkel is built for ephemeral,
  lightweight messages. Even with the hardening above, it is not positioned as
  a tool for journalists, whistleblowers, or other high-threat scenarios; use
  purpose-built tools for that. See [SECURITY.md](SECURITY.md).
- **Focused platform scope.** Munkel is a macOS app whose defining interaction
  is the MacBook notch. There are no current plans for iOS, Android, Windows,
  Linux, or web clients. The relay (Cloudflare Workers) and landing page are
  supporting infrastructure, not separate end-user products. We would rather do
  one platform well than spread thin.
- **No telemetry / analytics in the app.** We will not add usage analytics,
  tracking, or content-bearing telemetry to the app or the relay. Operational
  relay metrics (see *Next*) are deliberately limited to non-content signals.
  The marketing site (munkel.app) is the one exception: it uses privacy-first,
  cookieless website analytics that store nothing on your device — never the app
  or your messages.

---

Questions, corrections, or proposals about this roadmap are welcome via GitHub
issues. For how decisions are made and who can accept them, see
[GOVERNANCE.md](GOVERNANCE.md) and [MAINTAINERS.md](MAINTAINERS.md); for how to
contribute changes, see [CONTRIBUTING.md](CONTRIBUTING.md).
