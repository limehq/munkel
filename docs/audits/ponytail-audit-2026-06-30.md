# Ponytail audit — munkel (2026-06-30)

Repo-wide over-engineering and complexity audit. Scope: bloat and unnecessary
abstraction only — correctness, security, and performance are explicitly out
of scope.

**Method:** Full-tree scan across `apps/windows`, `apps/cli`, `apps/server`,
`apps/landing`, and `apps/macos`. Findings ranked by estimated cut size.
Line estimates are net savings after consolidation (duplicate removed minus
small shared module retained).

**Status:** Report written — **not yet reviewed or acted on.** See
[Open tasks](../README.md#open-tasks).

---

## Summary

| Metric | Quick wins (#2–#25) | Incl. Swift/TS core (#1) | Incl. stale doc (#17) |
|--------|---------------------|--------------------------|------------------------|
| Lines | ~900–1,050 | +800–1,200 | +157 |
| Dependencies | −2 certain | — | −2 to −5 optional |

---

## Findings (ranked)

| # | Tag | What to cut | Replacement | Path | Savings |
|---|-----|-------------|-------------|------|---------|
| 1 | yagni | Parallel Swift `MunkelKit` reimplementation (crypto, payload, codec, auth, control, blob, relay) mirrored in Windows TS | Shared TS/Rust/WASM core; Swift becomes thin FFI or reference-only | `apps/macos/Sources/MunkelKit/` (~882 lines) + `apps/windows/src/core/` (~1,184 lines) | ~800–1,200 (architecture milestone) |
| 2 | delete | Duplicate `control.ts` + `transport.ts` (CLI ↔ Windows; deliberately copied wire contract) | Shared package e.g. `packages/control` | `apps/cli/src/{control,transport}.ts`, `apps/windows/src/core/{control,transport}.ts` | ~245 |
| 3 | delete | Duplicate `protocol.ts` (wire spec + types in server and Windows) | Shared `packages/protocol` | `apps/server/src/protocol.ts`, `apps/windows/src/core/protocol.ts` | ~95 |
| 4 | stdlib | Hand-rolled HKDF/AES-GCM in dev scripts | Import `apps/windows/src/core/crypto` + `payload` | `apps/server/scripts/dev-send.ts`, `dev-image.ts`, `apps/windows/src/core/__tests__/interop-send.ts` | ~120 |
| 5 | delete | Renderer crypto IPC (`deriveGroupId`, `sealChat`, `openChat`) — renderer never calls; only main smoke uses `deriveGroupId` | Inline smoke in `main.ts` if needed | `apps/windows/src/main/crypto-channel.ts`, `preload.ts`, `shared/types.ts` | ~55 |
| 6 | delete | Second interop script (root `scripts/interop.ts` supersedes) | Keep `scripts/interop.ts` | `apps/windows/scripts/interop.ts` | ~70 |
| 7 | shrink | Triplicated wire constants (`BLOB_KEY_REGEX`, `MAX_BLOB_BYTES`, `MAX_PAYLOAD_CHARS`) | Single `wire-constants.ts` | `apps/windows/src/core/payload.ts`, `blob-upload.ts`, `apps/server/src/blob.ts` | ~25 |
| 8 | yagni | Three near-identical Electron window factories | `createOverlayWindow({ size, position, route, … })` | `apps/windows/src/main/menu-window.ts`, `palette-window.ts`, `notch-window.ts` | ~55 |
| 9 | delete | Unused landing dependencies (zero imports) | — | `apps/landing/package.json`: `@tanstack/react-router-ssr-query`, `@tailwindcss/typography` | 2 deps |
| 10 | yagni | `ProfileBroadcaster` class (1 s debounce, two methods) | Inline in `AppState` | `apps/windows/src/main/profile-broadcaster.ts` | ~24 |
| 11 | delete | `createPipeServer` in production CLI module (only tests use server side) | Move to test helper | `apps/cli/src/transport.ts` | ~55 |
| 12 | stdlib | Hand-rolled Unix socket client in CLI | Unify on `createPipeClient` from `transport.ts` | `apps/cli/src/munkel.ts` | ~40 |
| 13 | shrink | ~65-line protocol spec comment block duplicated | Link one `PROTOCOL.md` | Server + Windows `protocol.ts` | ~50 |
| 14 | yagni | `onImage` callback + `ImageMessage` (never wired in Windows main) | Remove or wire when image UI lands | `apps/windows/src/main/group-session.ts` | ~20 |
| 15 | yagni | `AvatarCodec` interface + factory (single `SharpAvatarCodec`; `decode()` stub) | Export `SharpAvatarCodec` directly | `apps/windows/src/core/avatar.ts` | ~20 |
| 16 | delete | `imageCodec.decode()` (exported, never called in Windows) | — | `apps/windows/src/core/image-codec.ts` | ~16 |
| 17 | delete | Stale plan doc (`NotchPanel` already implemented) | — | `apps/macos/docs/own-notch-presenter-plan.md` | ~157 |
| 18 | yagni | `Logger` interface with one `createLogger` implementation | Inline tagged JSON logger at call sites | `apps/server/src/lib/logger.ts` | ~8 |
| 19 | delete | `useIpc()` hook (one-line re-export of `window.electronAPI`) | Use `window.electronAPI` directly | `apps/windows/src/renderer/hooks/useIpc.ts` | ~5 |
| 20 | delete | Dead exports (`RelayEvent` type, `buttonVariants`) | — | `apps/windows/src/main/relay-client.ts`, `apps/landing/src/components/ui/button.tsx` | ~5 |
| 21 | delete | Trivial tests asserting types/constants exist without behavior | — | `apps/windows/src/shared/types.test.ts` | ~8 |
| 22 | shrink | `motion.ts` with only `easeInOutQuad` | Inline in `hero.tsx` or Motion built-in easing | `apps/landing/src/lib/motion.ts` | ~4 |
| 23 | shrink | `github-config.ts` (7 lines, one env override) | Colocate in `github-device-auth.ts` | `apps/windows/src/main/github-config.ts` | ~7 |
| 24 | yagni | shadcn-style stack for one `Button` (CVA + Radix Slot) | Plain `<button className=…>` | `apps/landing/src/components/ui/button.tsx` | ~15 lines, 2 deps |
| 25 | yagni | Empty `onChat` placeholder (“chat log UI not implemented yet”) | Remove until chat UI exists | `apps/windows/src/main/session-store.ts` | ~3 |

### Optional / dev-only (lower priority)

| Cut | Notes |
|-----|--------|
| `@tanstack/react-devtools`, `@tanstack/react-router-devtools`, `@tanstack/devtools-vite` | Stripped from prod bundle; still 3 install deps for dev UX |
| `@tanstack/router-cli` | Used by `generate-routes` — keep unless routes are commit-only |

---

## Recommended cut order

| Phase | Action | Risk |
|-------|--------|------|
| 1 | Shared `control` + `transport` package | Low |
| 2 | Drop unused landing deps + dead crypto IPC | Low |
| 3 | Consolidate dev-script crypto onto `windows/src/core` | Low |
| 4 | Merge protocol/constants; trim window factories | Medium |
| 5 | Swift/TS duplication as milestone (shared core) | High — not a drive-by |

---

## Intentionally kept (not bloat)

- **`sharp` + `@jsquash/avif` + `image-size`** — distinct paths (avatar JPEG vs AVIF album vs header probe).
- **`apps/landing/src/components/icons.tsx` GitHub SVG** — lucide has no GitHub glyph; low priority either way.
- **`scripts/skill-fake-app.ts`** — test/agent harness, not production bloat.
- **`apps/windows/docs/plans/`** — active Windows integration workflow per repo-root `AGENTS.md`.

---

## Tag legend

| Tag | Meaning |
|-----|---------|
| delete | Dead code, unused flexibility, speculative feature |
| stdlib | Hand-rolled logic the standard library already provides |
| native | Dependency duplicating a platform feature |
| yagni | Abstraction with one implementation or one caller |
| shrink | Same logic, fewer lines |
