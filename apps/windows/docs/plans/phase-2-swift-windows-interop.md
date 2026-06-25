# Phase 2: Swift ↔ Windows interop

**Branch:** `platform/windows/swift-windows-interop`  
**Target:** PR → `platform/windows/v2-clean`  
**Status:** Implemented — merge only via [PR #12](https://github.com/rodgi040/munkel/pull/12)

> The merge gate is **PR #12**, not PR #11 (PR #11 was `cli-windows-image`,
> already on `v2-clean` at `ced0a5e`). The commits exist on the feature branch
> (`2e4d24d`, `4c2f9de`), but local branch presence is **not** the same as being
> on `v2-clean` — only the PR #12 merge puts the interop vectors there. Do not
> start Plans 02–04 from a bare `v2-clean` until PR #12 merges.

## Goal

Pin cross-platform crypto, payload JSON, and codec constants so Swift (macOS)
and TypeScript (Windows) cannot drift silently before release.

## Deliverables (done)

| Artifact | Path |
|----------|------|
| Golden vectors | `scripts/interop-vectors/vectors.json` |
| Generator | `scripts/generate-interop-vectors.ts` |
| Windows tests | `apps/windows/src/core/__tests__/swift-interop.test.ts` |
| Swift tests | `apps/macos/Tests/MunkelKitTests/InteropVectorsTests.swift` |
| Fixed-nonce seal API | `MessageCrypto.seal(_:using:nonce:)` |
| Root script | `bun run test:interop:vectors` |

## Post-merge verification

```bash
# Windows / Bun (repo root)
bun run test:interop:vectors
bun run typecheck --filter=@munkel/windows
bun run test --filter=@munkel/windows

# macOS (human)
cd apps/macos && swift test --filter InteropVectorsTests
```

## Known limits

- `imageFixtures` SHA-256 pins skipped when Bun lacks `OffscreenCanvas`; refresh
  on Electron/macOS when enabling byte-level AVIF parity.

## Definition of done

- [x] 18 Windows interop tests pass (`bun run test:interop:vectors`)
- [ ] **PR #12** merged to `platform/windows/v2-clean`
- [ ] macOS `swift test --filter InteropVectorsTests` green (human)
