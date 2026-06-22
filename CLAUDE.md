# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Munkel: ephemeral, end-to-end-encrypted messages between friends ("channels") that
slide out of the MacBook notch. No accounts, no message storage. The repo
directory is `fluesterung` but the product/brand is **Munkel**.

`docs/ARCHITECTURE.md` is the authoritative, source-linked map of every component
and the data flow — read it before non-trivial work instead of re-deriving the
big picture here.

## Monorepo layout

Bun workspaces + Turborepo. Four apps under `apps/`:

- `apps/macos` — Swift/SwiftUI menu-bar app. **Owns all crypto and relay
  connections**; the CLI and the UI are clients of it. Two SwiftPM targets:
  `MunkelKit` (reusable lib: crypto, protocol, relay/blob clients, GitHub auth)
  and `MunkelApp` (menu-bar UI, notch presentation, control socket).
- `apps/cli` — the `munkel` CLI (Bun/TS). Thin and **send-only**: no crypto, no
  relay connection; serializes one JSON request over the app's Unix socket.
- `apps/server` — Cloudflare Worker relay (`munkel-relay`, Hono router) + one
  Durable Object per channel (partyserver, WebSocket hibernation, **no storage**).
- `apps/landing` — TanStack Start (React + Tailwind v4) on a Worker; marketing
  only, no access to relay traffic or keys.

## Commands

Everything runs from the repo root (Turbo fans out across packages):

```sh
bun install
bun run test         # Swift MunkelKit tests + CLI + server unit/e2e
bun run build
bun run typecheck
```

`bun run dev` deliberately excludes `@munkel/macos` (it needs the Swift
toolchain) — run the macOS app with its own command below.

Per-package dev servers (`--filter`):

- Relay: `bunx turbo dev --filter=@munkel/server` → `ws://127.0.0.1:8787`
- Landing: `bunx turbo dev --filter=@munkel/landing` → `http://localhost:3000`
- macOS app: `cd apps/macos && bun run dev` (builds + runs the **Munkel Dev** variant)

Single tests:

- Server (vitest): `cd apps/server && bunx vitest run test/blob.test.ts` (or `-t "<name>"`); e2e only: `bun run test:e2e`
- CLI (bun): `cd apps/cli && bun test test/munkel.test.ts`
- Swift: `cd apps/macos && swift test --filter CryptoTests`

## macOS development specifics

- `cd apps/macos && bun run dev` builds and launches **Munkel Dev**: a separate
  identity (bundle id `dev.uq.munkel.debug`, own UserDefaults, control socket,
  and menu-bar icon) that runs side by side with an installed release. It is the
  *debug* configuration; *release* is `Munkel` / `dev.uq.munkel`.
- The build goes through **Swift Bundler** via `make-bundle.sh` (not raw `swift
  build`): it assembles the `.app` from `Bundler.toml`, injecting version and
  archs. `scripts/ensure-swift-bundler.sh` builds the pinned bundler on demand.
- Drive the dev app from CLI source: `MUNKEL_DEV=1 bun apps/cli/src/munkel.ts channels`.
- Point a dev build at the local relay: `MUNKEL_RELAY_URL=ws://127.0.0.1:8787 bun run dev`
  (read once at launch, never persisted).
- **Requires Xcode 26** (Swift toolchain ≥ 6.2): the KeyboardShortcuts 3.x
  dependency needs it even though `Package.swift` declares tools 6.0. CI uses the
  `macos-26` runner.
- Release builds are forced to `-Onone` in `make-bundle.sh` to dodge a SIL
  inliner segfault (swiftlang/swift#88173) under `-O` with KeyboardShortcuts'
  MainActor isolation. Do **not** "fix" this by re-enabling `-O`.

## Cross-cutting invariants (span multiple files — keep them in sync)

- **Wire protocol**: `apps/server/src/protocol.ts` is authoritative. Swift mirrors
  it in `MunkelKit/WireMessage.swift`; the TS reference sender is
  `apps/server/scripts/dev-send.ts`. Change one → change all three.
- **Crypto interop**: group/key derivation (HKDF-SHA256) and AES-256-GCM seal/open
  must match byte-for-byte between Swift (`MunkelKit/GroupKey.swift`,
  `MessageCrypto.swift`) and TS (`dev-send.ts`). Interop is pinned in
  `CryptoTests.swift` — a derivation tweak that breaks that test breaks live
  Swift↔TS messaging.
- **CLI ↔ app contract**: `MunkelKit/ControlProtocol.swift` is mirrored in
  `apps/cli/src/munkel.ts`. The app resolves channel-code prefixes and recipient
  display names (`AppModel.handleControl`); the CLI stays dumb. `MUNKEL_SOCKET`
  overrides the socket path (the tests use it).
- **Ephemerality is structural, not policy**: the `GroupRoom` Durable Object uses
  **no DO storage for messages** (only a `setAlarm` to reap stale connections).
  Don't add message buffering/persistence — an offline member is meant to miss
  the message.
- **Capture-proof surfaces**: every window showing message content or a channel
  code sets `NSWindow.sharingType = .none` via the `CaptureExclusion` view.
  Corollary the code relies on: **no `.help()` tooltips in notch content** (AppKit
  draws tooltips in a separate, capturable window). See `CaptureExclusion.swift`.
- **Images**: full-resolution images travel out-of-band as opaque ciphertext in
  R2 (`munkel-blobs`, ~66 s TTL + per-minute cron sweep); the relay frame carries
  only a small inline AVIF thumbnail plus an `r2Key` pointer. Relay payload cap is
  48 KiB of base64 ciphertext.

## Deploy

Both Workers auto-deploy from GitHub Actions on `main` pushes that touch their
paths (`deploy-server.yml`, `deploy-landing.yml`). Manual deploy needs a
`wrangler login` with access to the `limehq` account:

```sh
bunx turbo deploy --filter=@munkel/server     # relay.munkel.app
bunx turbo deploy --filter=@munkel/landing    # munkel.app
```

One-time before the first relay deploy that includes the R2 binding (the deploy
fails otherwise): `cd apps/server && bunx wrangler r2 bucket create munkel-blobs`.

## Working on an issue

Follow the **`github-issue-workflow`** skill: check the issue isn't already taken
(open/draft PR or an assignee) before starting, then claim it and open a draft PR
linked with `Closes #N`.

## Conventions

- **No comments in source code (Swift/TS).** Zero — code must be fully
  self-documenting through clear names and small functions. Don't add narrating
  or "AI-slop" comments (see #97). This applies to application source
  (`apps/*/src/**.ts`, `apps/macos/Sources/**.swift`). Comments still present in
  source today — including the `protocol.ts` spec block — are tech debt to be
  removed over time, not a license to add more. Build scripts (`*.sh`) and config
  (`Bundler.toml`, `wrangler.*`, `turbo.json`) keep their workaround/why notes.
- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
  Release Please derives `CHANGELOG.md` and releases from them.
- **Docs live next to the code and are part of the change.** When behavior
  changes, update the relevant docs (`README.md`, `docs/ARCHITECTURE.md`,
  `SECURITY.md`, `PRIVACY.md`, …) in the same PR — drift is treated as a tracked
  bug.
- **Terminology**: "channel" is the human-facing term for a group; `group` /
  `groupId` is its derived machine identifier. "Whisper" is legacy (it survives in
  the repo name and a couple of scripts like `simulate-whispers.sh`); prefer
  "message" / "channel" in new code and docs.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
