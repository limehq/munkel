# Windows integration — agent execution plans

Sequential feature plans for coding agents. Each plan maps to one feature
sub-branch off `platform/windows/v2-clean` (see repo-root `AGENTS.md`).

## Execution order

| # | Plan | Branch | Depends on | Priority |
|---|------|--------|------------|----------|
| — | [Phase 2: Swift ↔ Windows interop](./phase-2-swift-windows-interop.md) | `platform/windows/swift-windows-interop` | PR #11 merged | **Ship via PR** |
| 1 | [Notch reply polish](./01-notch-reply-polish.md) | `platform/windows/notch-reply-polish` | Phase 2 merged into `v2-clean` | Next |
| 2 | [GitHub OAuth (Windows)](./02-github-oauth-windows.md) | `platform/windows/github-oauth-windows` | #1 or parallel | Optional for v1 |
| 3 | [Windows CI](./03-windows-ci.md) | `platform/windows/windows-ci` | #1–2 or parallel | Before release |
| 4 | [Release packaging](./04-packaging.md) | `platform/windows/packaging` | #3 green | Launch gate |

## Agent workflow (every plan)

1. Read `AGENTS.md` (branch rules, no self-merge, no release-please).
2. Branch from latest `platform/windows/v2-clean`:
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
7. Update private `State.md` / `Roadmap.md` (gitignored) when done.

## Fork constraints

- All `gh` commands: `--repo rodgi040/munkel` (not `limehq/munkel`).
- Do not push to `main` or upstream `limehq/munkel`.
- macOS-only verification steps are marked **human** — skip on Windows-only agents.

## Current status (2026-06-25)

- Phase 2: implemented, pending merge PR → `v2-clean`
- Active implementation branch: `platform/windows/notch-reply-polish`
