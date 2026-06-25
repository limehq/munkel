# Plan 03: Windows CI (GitHub Actions)

**Branch:** `platform/windows/windows-ci`  
**Base:** `platform/windows/v2-clean`  
**Estimate:** 1 session  
**Blocks:** Upstream confidence + Plan 04 packaging validation

## Goal

Add a `windows-latest` job to CI that runs Windows-native checks for
`@munkel/windows` on every PR/push, matching what developers run locally.

## Current CI (reference)

`.github/workflows/ci.yml`:

- `checks` — ubuntu, `turbo run test typecheck --filter="!@munkel/macos"`
- `macos` — `swift test` in `apps/macos`

Windows is **not** covered on native OS today (ubuntu job may run Windows tests
in Bun but not Electron build nuances).

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

- Pin action SHAs like existing jobs
- `test:interop:vectors` is root script — run from repo root
- Electron download on CI adds time; cache if needed (`actions/cache` on `~/.cache/electron`)

**Acceptance:** Job runs on PR to fork branches (confirm `on.pull_request` triggers).

### Task 2 — Branch filter (fork workflow)

Ensure CI runs for PRs targeting `platform/windows/v2-clean` and eventually
`main`. If only `main` is listed in `on.push.branches`, add:

```yaml
on:
  pull_request:
  push:
    branches: [main, platform/windows/v2-clean]
```

Or rely on `pull_request` only for feature branches.

**Acceptance:** Opening PR from `platform/windows/notch-reply-polish` runs `windows` job.

### Task 3 — Optional electron-builder smoke

**Only if fast enough (<5 min extra):**

```yaml
- run: bunx electron-builder --win dir --config apps/windows/electron-builder.yml
  working-directory: apps/windows
```

Mark as optional first run; skip if Electron build requires code signing setup.

**Acceptance:** Document in PR whether dir target builds on CI or deferred to Plan 04.

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

- [ ] `windows-latest` job green on sample PR
- [ ] typecheck + test + build covered
- [ ] interop vectors run in CI
- [ ] PR merged to `platform/windows/v2-clean`

## Trigger for upstream outreach

Per `State.md`: contact upstream maintainer when **feature parity** AND
**windows-ci green** — this plan satisfies the CI half.
