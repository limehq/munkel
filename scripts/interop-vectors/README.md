# Swift ↔ Windows interop vectors

Shared golden fixtures consumed by:

- `apps/windows/src/core/__tests__/swift-interop.test.ts`
- `apps/macos/Tests/MunkelKitTests/InteropVectorsTests.swift`

## Regenerate (Windows / Bun)

From repo root:

```bash
bun scripts/generate-interop-vectors.ts
bun run test --filter=@munkel/windows
```

On macOS, also run `swift test` in `apps/macos` to verify Swift opens the same
sealed blobs and reproduces the same AVIF hashes.

## What is pinned

| Section | Purpose |
|---|---|
| `derivation` | HKDF group-id vectors (already pinned in both codebases) |
| `payloads` | Canonical JSON app payloads both sides must decode identically |
| `sealed` | AES-256-GCM blobs sealed with a **fixed 12-byte nonce** for cross-open tests |
| `codecConstants` | Avatar / image budget constants — drift breaks tests immediately |
| `imageFixtures` | Shared PNG input + expected `prepareFull` / `makeThumbnail` SHA-256 on Windows |

Image SHA-256 pins catch silent drift between `@jsquash/avif` and
`ImageCodec.swift`. Refresh on macOS if the Swift encoder changes intentionally.
