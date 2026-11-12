# Plan 03: Windows CI (GitHub Actions)

**Branch:** `platform/windows/windows-ci`  
**Base:** `platform/windows/v2-clean`  
**Estimate:** 1 session  
**Blocks:** Upstream confidence + Plan 04 packaging validation

## Goal

Add a `windows-latest` job to CI that runs Windows-native checks for
`@munkel/windows` on every PR/push, matching what developers run locally.

## Current CI (reference)

`.github/workflows/ci.yml` triggers on `pull_request` and `push` to `main`
**only** (`on.push.branches: [main]`):

- `checks` — ubuntu, `turbo run test typecheck --filter="!@munkel/macos"`.
  This **already runs the `@munkel/windows` Bun tests** on Linux.
- `macos` — `swift test` in `apps/macos`.

What is missing is **native-Windows** coverage: the Electron `build` on
`windows-latest` (path separators, native module load, `.cjs` main bundle) — not
the unit tests, which the ubuntu job covers. This plan adds the native OS build,
not a duplicate test run.

## Out of scope

- macOS CI changes
- Release publishing (Plan 04)
- Signing secrets in CI (Plan 04)

## Tasks (sequential)

### Task 1 — Add workflow job

**File:** `.github/workflows/ci.yml` (or new `.github/workflows/windows.yml`)

Recommended: extend `ci.yml` with job `windows`:

```yaml
windows:
  runs-on: windows-latest
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@...
    - uses: oven-sh/setup-bun@...
      with:
        bun-version: "1.3.14"
    - run: bun install --frozen-lockfile
    - run: bunx turbo run typecheck test --filter=@munkel/windows
    - run: bun run test:interop:vectors
    - run: bunx turbo run build --filter=@munkel/windows
```

**Notes:**

- Pin action SHAs like existing jobs.
- `test:interop:vectors` is a root script — run from repo root.
- Electron download on CI adds time; cache `~/.cache/electron` (and consider
  caching the Bun install) with `actions/cache` if the job approaches the
  20-min timeout.

**Acceptance:** Job runs on PRs targeting `platform/windows/v2-clean` (the
existing `on.pull_request` trigger fires for any base branch).

### Task 2 — Trigger reality check (no change usually needed)

The existing `on.pull_request` already triggers for **PRs** into any branch,
including `platform/windows/v2-clean` — so PR-based feature work is covered with
no edit.

What is **not** covered: a direct **push** to `platform/windows/v2-clean`
(without a PR) — `on.push.branches` lists only `main`. Since the fork workflow
merges features via PR (see `AGENTS.md`), this is fine. Only if you want CI on
direct pushes to the integration branch, extend:

```yaml
on:
  pull_request:
  push:
    branches: [main, platform/windows/v2-clean]
```

**Acceptance:** A PR from `platform/windows/notch-reply-polish` →
`platform/windows/v2-clean` runs the `windows` job. (Direct-push CI is optional
and off by default.)

### Task 3 — Optional electron-builder smoke (BLOCKED until Plan 04)

`electron-builder` is **not yet a dependency** and there is no `pack` script
(see Plan 04 Task 1). Do **not** add an `electron-builder` step here — it would
fail. The `bunx turbo run build` step above already exercises the Vite/tsc build
on Windows, which is the meaningful native-OS signal for this plan.

Revisit packaging smoke in Plan 04 once the dependency and scripts exist.

**Acceptance:** No `electron-builder` invocation in this plan's workflow; native
`build` is green on `windows-latest`.

### Task 4 — README badge / docs

**Files:**

- `apps/windows/README.md` — "CI: windows-latest" section
- Root `README.md` — Windows build instructions stub (cross-link Plan 04)

### Task 5 — Verify on PR

Push branch, confirm GitHub Actions green on `windows-latest`.

Fix flaky tests (path separators, line endings) if any appear.

## Verification commands (local, Windows)

```bash
bun install --frozen-lockfile
bunx turbo run typecheck test build --filter=@munkel/windows
bun run test:interop:vectors
```

## Definition of done

- [ ] `windows-latest` job green on a sample PR into `platform/windows/v2-clean`
- [ ] typecheck + test + build covered on native Windows
- [ ] interop vectors run in CI
- [ ] No `electron-builder` step (deferred to Plan 04)
- [ ] PR merged to `platform/windows/v2-clean`

## Trigger for upstream outreach

Per `.planning/STATE.md` (and the gitignored private `State.md`): contact the
upstream maintainer when **feature parity** AND **windows-ci green** — this plan
satisfies the CI half.
