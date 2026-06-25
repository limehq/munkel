# Plan 02: GitHub OAuth device flow (Windows)

**Branch:** `platform/windows/github-oauth-windows`  
**Base:** `platform/windows/v2-clean`  
**Estimate:** 2–3 sessions  
**Priority:** Optional for v1 (macOS parity item)

## Goal

Implement GitHub OAuth **device flow** on Windows: user signs in from the menu,
browser opens github.com, profile name + avatar imported, token discarded.
Matches macOS behavior documented in root `README.md` § "Login with GitHub".

## Reference implementation (macOS — port, do not rewrite protocol)

| Concern | macOS source |
|---------|----------------|
| Device flow HTTP | `apps/macos/Sources/MunkelKit/GitHubDeviceAuth.swift` |
| Login orchestration | `apps/macos/Sources/MunkelApp/AppModel.swift` (`runGitHubLogin`) |
| Client ID config | `apps/macos/Sources/MunkelApp/GitHubConfig.swift` |
| Identity persistence | `apps/macos/Sources/MunkelApp/Identity.swift` |
| Avatar encode | `MunkelKit/AvatarCodec.swift` → port exists in Windows core |
| UI states | `apps/macos/Sources/MunkelApp/MenuView.swift` GitHub section |
| Tests | `apps/macos/Tests/MunkelKitTests/GitHubDeviceAuthTests.swift` |

Windows already has persistence hooks:

- `apps/windows/src/main/identity-store.ts` — `githubLogin`, `avatar`, `displayName`
- `apps/windows/docs/ui-spec.md` — GitHub area states (idle/requesting/awaiting/fetching/failed)
- `MenuWindow.tsx` — placeholder `github-row` (currently only "Test notch")

## Out of scope

- Storing OAuth tokens (explicitly forbidden — one-time profile fetch)
- GitHub App vs OAuth app migration
- macOS changes unless shared test vectors needed

## Prerequisites

- GitHub OAuth app with **Enable Device Flow** (same client ID as macOS default
  or env override — document in plan PR)
- Windows can open default browser (`shell.openExternal`)

## Tasks (sequential)

### Task 1 — Port `GitHubDeviceAuth` to TypeScript

**New file:** `apps/windows/src/core/github-device-auth.ts`

1. `requestDeviceCode()` → POST `https://github.com/login/device/code`
2. `pollForAccessToken(grant)` → POST `https://github.com/login/oauth/access_token`
   with interval / `authorization_pending` / `slow_down` handling
3. `fetchUser(token)` → GET `https://api.github.com/user`
4. `fetchAvatar(url, pixelSize)` → GET sized avatar URL
5. Error enum mirroring Swift: `deviceFlowDisabled`, `expired`, `accessDenied`, `http`, `malformedResponse`
6. Use `fetch` (Node 18+ / Electron main process)

**Tests:** `apps/windows/src/core/__tests__/github-device-auth.test.ts`

- Mock `fetch` with fixtures from Swift tests (device code response, poll success,
  user JSON, error codes)
- Minimum 8 tests covering happy path + `authorization_pending` + expired

**Acceptance:** Tests pass without network.

### Task 2 — Avatar pipeline

**Files:** `apps/windows/src/core/avatar-codec.ts` (create if missing — mirror Swift budgets)

1. Reuse codec constants from interop vectors (`codecConstants.avatar`)
2. `makeAvatar(raw: Buffer): Buffer` — JPEG, ≤ max bytes/pixels per AvatarCodec
3. Wire into identity store on login success

**Acceptance:** Avatar size within interop vector budgets.

### Task 3 — Main-process login service

**New file:** `apps/windows/src/main/github-login.ts`

1. State machine: `idle | requesting | awaiting | fetching | failed`
2. Generation counter (cancel stale flows — mirror Swift `githubLoginGeneration`)
3. On success: patch `identity-store` (`displayName`, `avatar`, `githubLogin`)
4. Broadcast profile to joined circles via existing `GroupSession` profile send
5. Open browser via `shell.openExternal(verificationURI)`
6. Copy user code to clipboard (`clipboard.writeText`)

**IPC:** extend preload + `ipc-contract.md`:

- `github-login-start`
- `github-login-cancel`
- `github-login-state` (push updates to renderer)

**Acceptance:** IPC documented; no token persisted to disk.

### Task 4 — Menu UI

**Files:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `global.css`

Implement ui-spec states:

| State | UI |
|-------|-----|
| idle | "Sign in with GitHub" button |
| requesting | Spinner |
| awaiting | Show `user-code`, "Browser opened", Cancel |
| fetching | Spinner + "Fetching profile…" |
| failed | Error message + Retry |

Remove or relocate "Test notch" dev button to dev-only flag if desired.

**Acceptance:** Full state flow manually testable (use real GitHub or mocked IPC in dev).

### Task 5 — Logout

1. Clear `githubLogin`, `avatar` (optional: keep display name)
2. Send profile update to circles (avatar cleared — interop hardening already handles this)
3. UI returns to idle

**Acceptance:** Receivers see avatar cleared per existing profile payload rules.

### Task 6 — Config

**New file:** `apps/windows/src/main/github-config.ts`

- Default client ID (same as macOS `GitHubConfig.defaultClientID`)
- Override via env `MUNKEL_GITHUB_CLIENT_ID` or electron-store key

Document in `apps/windows/README.md`.

### Task 7 — Verification

```bash
bun run typecheck --filter=@munkel/windows
bun run test --filter=@munkel/windows
bun run test:interop:vectors   # ensure profile payloads still decode
```

**Human:** Sign in with real GitHub account; verify avatar in menu + peer notch.

### Task 8 — PR

Title: `feat(windows): GitHub OAuth device flow for profile and avatar`

## Definition of done

- [ ] Device flow works end-to-end on Windows
- [ ] Token never persisted
- [ ] Unit tests for HTTP layer (mocked)
- [ ] ui-spec + ipc-contract updated
- [ ] PR to `platform/windows/v2-clean`

## Open product decision

Ship Windows v1 **without** this plan if manual display name is acceptable
(macOS shipped the same way initially). Do not block Plans 03–04 on this plan.
