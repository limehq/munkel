# Plan 02: GitHub OAuth device flow (Windows)

**Branch:** `platform/windows/github-oauth-windows`  
**Base:** `platform/windows/v2-clean` — **only after PR #12 (Phase 2) merges**, so the
base includes interop vectors. If branching before that, branch from
`platform/windows/notch-reply-polish` instead.  
**Estimate:** 2–3 sessions  
**Priority:** Optional for v1 (macOS parity item)

## Product divergence from macOS (decide before UI work)

macOS **requires** GitHub sign-in before the circles UI is usable (login gates
the app). **Windows v1 keeps GitHub optional**: circles work with a manual
display name and no login (the placeholder `github-row` in `MenuWindow.tsx` is
additive, not a gate). Implement sign-in as an *enhancement* that imports a
nicer name + avatar, never as a hard requirement. State this choice in the PR
body.

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

Windows already has *partial* persistence hooks — but they are **not wired into
the runtime identity** yet (see Task 2.5):

- `apps/windows/src/main/identity-store.ts` — `PersistedState` already has
  `githubLogin?` and `avatar?`, and `patch()` accepts both. **However**
  `session-store.ts` `updateIdentity(displayName, avatar)` ignores `githubLogin`,
  and `IdentityState` in `src/shared/types.ts` has **no `githubLogin` field** —
  so a persisted login never reaches the renderer today.
- `apps/windows/src/core/avatar.ts` — existing `AvatarCodec` interface with a
  `PassthroughAvatarCodec` (byte-budget check only, **no real downscale/encode**).
- `apps/windows/src/renderer/components/Avatar.tsx` — renders **initials/emoji
  only**; it has no image rendering path.
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
   - Body: `client_id` + `scope=` (**empty scope** — profile read only)
2. `pollForAccessToken(grant)` → POST `https://github.com/login/oauth/access_token`
   with interval / `authorization_pending` / `slow_down` (back off by 5s) handling
3. `fetchUser(token)` → GET `https://api.github.com/user`
4. `fetchAvatar(url, pixelSize)` → GET sized avatar URL (append `?s=<pixelSize>`)
5. Error enum mirroring Swift: `deviceFlowDisabled`, `expired`, `accessDenied`, `http`, `malformedResponse`
6. Use `fetch` (Node 18+ / Electron main process)

**Required request details (mirror `GitHubDeviceAuth.swift:137–182`):**

- All requests set `User-Agent: munkel`.
- POST forms: `Accept: application/json`, body `application/x-www-form-urlencoded`.
- `fetchUser`: `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`,
  `X-GitHub-Api-Version: 2022-11-28`.
- Pass `cache: 'no-store'` on **every** `fetch` so bearer responses are never
  cached to disk (Swift uses an ephemeral `URLSession` for the same reason).

**Tests:** `apps/windows/src/core/__tests__/github-device-auth.test.ts`

- Inject a `fetch`-shaped transport (do not hit the network); reuse fixtures
  from `apps/macos/Tests/MunkelKitTests/GitHubDeviceAuthTests.swift`
  (device code response, poll success, user JSON, error codes)
- Minimum 8 tests covering happy path + `authorization_pending` + `slow_down` + expired

**Acceptance:** Tests pass without network; no `fetch` omits `cache: 'no-store'`.

### Trust boundary (read before Task 2)

- The access token exists **only in RAM** for the lifetime of the login task —
  never written to `state.json`, logs, or any cache.
- Empty OAuth scope: the token can read public profile only.
- Persist **only** `displayName`, the base64 avatar (JPEG ≤ budget), and
  `githubLogin`. Never persist the token.
- Every GitHub `fetch` uses `cache: 'no-store'`.

### Task 2 — Avatar pipeline

**File:** extend the **existing** `apps/windows/src/core/avatar.ts` — do **not**
create `avatar-codec.ts` (it does not exist; `avatar.ts` is the file).

Today `avatar.ts` exports `MAX_AVATAR_BYTES = 20480`, `MAX_DECODED_PIXELS = 256`,
the `AvatarCodec` interface, and a `PassthroughAvatarCodec` that only checks the
byte budget. Replace the passthrough `encode` with a real downscale + JPEG
re-encode:

1. Use `sharp` (already a devDependency in `apps/windows/package.json`) in the
   main process to downscale to ≤ `MAX_DECODED_PIXELS` longest side and encode
   JPEG until ≤ `MAX_AVATAR_BYTES`.
2. Keep the `AvatarCodec` interface and budgets stable; swap the implementation
   behind `createAvatarCodec()`.
3. Cross-check the budgets against the interop vectors `codecConstants.avatar`
   (they must not drift from `scripts/interop-vectors/vectors.json`).

**Note:** `sharp` is a native module — confirm it loads in the Electron main
process (it does for the image pipeline already). If renderer use is needed,
keep encoding in the main process and pass base64 over IPC.

**Acceptance:** A real GitHub avatar re-encodes to a JPEG ≤ `MAX_AVATAR_BYTES`
with longest side ≤ `MAX_DECODED_PIXELS`; budgets equal `codecConstants.avatar`.

### Task 2.5 — Wire `githubLogin` + avatar into runtime identity

This wiring is **missing today** and the login flow cannot surface a profile
without it.

**Files:**

- `apps/windows/src/shared/types.ts` — add `githubLogin?: string` to
  `IdentityState` (currently only `memberId`, `displayName`, `avatar?`).
- `apps/windows/src/main/session-store.ts` — load `githubLogin` from the
  `IdentityStore` into `this.identity` in the constructor, and extend
  `updateIdentity()` (currently `(displayName, avatar)`) to also accept and
  patch `githubLogin`.
- `apps/windows/src/main/identity-store.ts` — already supports it via
  `patch({ githubLogin })`; no change beyond confirming the migration keeps it.

**Acceptance:** A persisted `githubLogin` round-trips into `StateUpdate.identity`
and reaches the renderer.

### Task 3 — Main-process login service

**New file:** `apps/windows/src/main/github-login.ts`

1. State machine: `idle | requesting | awaiting | fetching | failed`
2. Generation counter (cancel stale flows — mirror Swift `githubLoginGeneration`)
3. On success: patch `identity-store` and runtime identity via the Task 2.5
   `updateIdentity()` (`displayName`, `avatar`, `githubLogin`)
4. Broadcast the updated profile to joined circles immediately. Check how
   `session-store.ts` currently propagates `updateIdentity` to each
   `GroupSession` profile send and reuse that path (do not invent a new
   broadcaster). If a debounce exists, force an immediate flush after login
   (macOS calls `ProfileBroadcaster.flushNow()`).
5. Open browser via `shell.openExternal(verificationURI)`
6. Copy user code to clipboard (`clipboard.writeText`)

**IPC — wire the full chain, not just docs.** Edit every layer:

- `apps/windows/src/main/preload.ts` — expose `startGitHubLogin()`,
  `cancelGitHubLogin()`, `onGitHubLoginState(cb)`.
- `apps/windows/src/shared/types.ts` — add these to the `IpcApi`/`electronAPI`
  type so the renderer is typed.
- Main-process handler registration (where other `ipcMain.handle`/`on` live,
  e.g. alongside `session-handlers.ts`) — register start/cancel.
- Push `github-login-state` updates to the **menu** window (use the same
  window-send pattern as `state-update`/`notch-message`).
- `apps/windows/src/renderer/store/app-store.tsx` — subscribe to
  `onGitHubLoginState` and expose it to `MenuWindow`.
- `apps/windows/docs/ipc-contract.md` — document the three channels + payloads.

**Acceptance:** Renderer can start/cancel login and receive typed state pushes;
no token persisted to disk; `ipc-contract.md` matches the implemented channels.

### Task 4 — Menu UI (states + avatar rendering)

**Files:** `apps/windows/src/renderer/components/MenuWindow.tsx`,
`apps/windows/src/renderer/components/Avatar.tsx`,
`apps/windows/src/renderer/styles/global.css`

Implement ui-spec states (also update `ui-spec.md` line ~168, currently only
names the states — add the copy/layout for each, plus a signed-in row):

| State | UI |
|-------|-----|
| idle (logged out) | "Sign in with GitHub" button in `github-row` |
| requesting | Spinner |
| awaiting | Show `user-code`, "Browser opened", Cancel |
| fetching | Spinner + "Fetching profile…" |
| failed | Error message + Retry |
| signed in | "Signed in as `<name>` (@`<login>`)" + avatar + "Sign out" |

**Avatar rendering (currently missing):** `Avatar.tsx` renders initials only.
Add an optional `imageBase64?: string` prop; when present render
`<img src="data:image/jpeg;base64,…">` instead of the initials gradient. Feed
the signed-in user's avatar from `state.identity.avatar`.

Remove or relocate "Test notch" dev button to a dev-only flag if desired.

**Acceptance:** Full state flow manually testable; a signed-in user shows their
GitHub avatar (not initials) in the menu.

### Task 5 — Logout (pick a behavior)

macOS `AppModel.logoutGitHub()` (`AppModel.swift:211–222`) clears
`avatarData` + `githubLogin` **and stops every session** (`sessions = [:]`),
making the app idle until re-login.

- **Option A — macOS parity:** stop all `GroupSession`s, clear circles from the
  live state, clear `githubLogin`/`avatar`, persist, UI returns to idle.
- **Option B — v1 Windows (default):** clear `githubLogin`/`avatar` (keep the
  manual display name and connected circles), broadcast a profile update with
  the avatar cleared (interop hardening already honors avatar clearing). Sessions
  stay connected.

Pick one in the PR body. Default **Option B** unless the product owner chooses A.

**Also add:** a `cancelGitHubLogin`/`github-logout` IPC channel and the
"Sign out" control in the signed-in UI (Task 4).

**Acceptance:** Receivers see avatar cleared per existing profile payload rules;
chosen option documented in PR.

### Task 6 — Config

**New file:** `apps/windows/src/main/github-config.ts`

- Default client ID (same as macOS `GitHubConfig.defaultClientID`).
- Override via env `process.env.MUNKEL_GITHUB_CLIENT_ID` (mirrors the macOS
  `UserDefaults` override). **Do not** introduce `electron-store` — it is not a
  dependency of this app; if a persisted override is later wanted, reuse the
  existing `IdentityStore` JSON, not a new store.

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
- [ ] Token never persisted; every GitHub `fetch` uses `cache: 'no-store'`
- [ ] `avatar.ts` does a real downscale + JPEG encode within budgets (not passthrough)
- [ ] `githubLogin` wired through `IdentityState` + `session-store` to renderer (Task 2.5)
- [ ] Full IPC chain wired (preload, types, handlers, push, app-store) — not just docs
- [ ] `Avatar.tsx` renders the GitHub avatar image for the signed-in user
- [ ] Logout option (A or B) implemented and named in the PR body
- [ ] Unit tests for HTTP layer (mocked, no network)
- [ ] ui-spec + ipc-contract updated
- [ ] PR to `platform/windows/v2-clean`

## Open product decision

Ship Windows v1 **without** this plan if manual display name is acceptable
(macOS shipped the same way initially). Do not block Plans 03–04 on this plan.
