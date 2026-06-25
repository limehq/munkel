# Windows integration — agent execution plans

Sequential feature plans for coding agents. Each plan maps to one feature
sub-branch off `platform/windows/v2-clean` (see repo-root `AGENTS.md`).

## Execution order

| # | Plan | Branch | Depends on | Status |
|---|------|--------|------------|--------|
| — | [Phase 2: Swift ↔ Windows interop](./phase-2-swift-windows-interop.md) | `platform/windows/swift-windows-interop` | base for #1–4 | ✅ Merged (PR #12) |
| 1 | [Notch reply polish](./01-notch-reply-polish.md) | `platform/windows/notch-reply-polish` | Phase 2 | ✅ Merged (PR #13) |
| 2 | [GitHub OAuth (Windows)](./02-github-oauth-windows.md) | `platform/windows/github-oauth-windows` | Phase 2 | ✅ Merged (PR #15) |
| 3 | [Windows CI](./03-windows-ci.md) | `platform/windows/windows-ci` | Phase 2 | ✅ Merged (PR #14) |
| 4 | [Release packaging](./04-packaging.md) | `platform/windows/packaging` | #3 green | ✅ Merged (PR #16) |

> **All Windows-integration plans are merged into `platform/windows/v2-clean`.**
> Phase 2 + Plans 01–04 shipped via PR #12–#16; the `v2-clean` tip is `14b9ffc`.
> The feature sub-branches were tagged (`feat/windows-*`) and deleted after merge.
> The individual plan files below are kept as historical execution references —
> their per-task "next step" wording reflects the state at authoring time, not now.

## Agent workflow (every plan)

1. Read `AGENTS.md` (branch rules, no self-merge, no release-please).
2. Pick the correct base branch:
   - **Plan 01 (notch-reply-polish):** the branch already exists with Phase 2
     stacked on top. Stay on it — do **not** recreate it from a bare
     `v2-clean`:
     ```bash
     git fetch origin
     git checkout platform/windows/notch-reply-polish
     git pull origin platform/windows/notch-reply-polish
     ```
   - **Plans 02–04 (new branches):** only branch from `v2-clean` **after**
     PR #12 has merged (otherwise Phase 2 is absent). Then:
     ```bash
     git fetch origin
     git checkout platform/windows/v2-clean
     git pull origin platform/windows/v2-clean
     git checkout -b platform/windows/<feature>
     ```
3. Read the plan file end-to-end before editing code.
4. Implement tasks **in order**; do not skip verification steps.
5. Run verification commands listed in the plan.
6. Open PR to `platform/windows/v2-clean` with `--repo rodgi040/munkel`.
7. Update private planning state in `.planning/STATE.md` when done. (The
   repo-root `State.md` / `Roadmap.md` are gitignored private notes — update
   them too if present, but they never ship.)

## Fork constraints

- All `gh` commands: `--repo rodgi040/munkel` (not `limehq/munkel`).
- Do not push to `main` or upstream `limehq/munkel`.
- macOS-only verification steps are marked **human** — skip on Windows-only agents.

## Current status (2026-06-25)

- **windows-native-full-build COMPLETE.** Phase 2 + Plans 01–04 all merged via
  PR #12–#16 into `platform/windows/v2-clean` (tip `14b9ffc`); CI green.
- Per-feature tracking artifacts live in `.planning/phases/{0,A,B,C,D}-*/`.
- Next gate is the human-owned final PR from the Windows integration to `main`
  (see `AGENTS.md` — main is reached exactly once, manually reviewed). Plus the
  non-blocking human gates: real GitHub login test, fresh-VM QA, NSIS+signing.
