# Windows integration — agent execution plans

Sequential feature plans for coding agents. Each plan maps to one feature
sub-branch off `platform/windows/v2-clean` (see repo-root `AGENTS.md`).

## Execution order

| # | Plan | Branch | Depends on | Priority |
|---|------|--------|------------|----------|
| — | [Phase 2: Swift ↔ Windows interop](./phase-2-swift-windows-interop.md) | `platform/windows/swift-windows-interop` | **PR #12 merged into `v2-clean`** | **Ship via PR** |
| 1 | [Notch reply polish](./01-notch-reply-polish.md) | `platform/windows/notch-reply-polish` | continues on existing branch (see workflow) | Next |
| 2 | [GitHub OAuth (Windows)](./02-github-oauth-windows.md) | `platform/windows/github-oauth-windows` | #1 or parallel, base must include Phase 2 | Optional for v1 |
| 3 | [Windows CI](./03-windows-ci.md) | `platform/windows/windows-ci` | #1–2 or parallel | Before release |
| 4 | [Release packaging](./04-packaging.md) | `platform/windows/packaging` | #3 green | Launch gate |

> **Phase 2 is NOT yet on `v2-clean`.** Its commits (`2e4d24d`, `4c2f9de`) live
> only on `platform/windows/swift-windows-interop` and the stacked
> `platform/windows/notch-reply-polish`. The `v2-clean` tip is still
> `ced0a5e` (PR #11, `cli-windows-image`). Merge [PR #12](https://github.com/rodgi040/munkel/pull/12)
> before cutting any new branch from a bare `v2-clean`, or the interop vectors
> and Swift tests will be missing from your branch.

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

- Phase 2: implemented; PR #12 open, **not yet merged** into `v2-clean`.
- Active implementation branch: `platform/windows/notch-reply-polish` (Phase 2
  is stacked on it). Implement Plan 01 here now; do not branch new work from a
  bare `v2-clean` until PR #12 merges.
