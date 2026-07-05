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
| 5 | [Notch Peek + 60s History](./05-notch-message-timer.md) | `platform/windows/notch-peek-history` | #4 in `v2-clean` | ✅ Merged (PR #22) |
| 6 | [Menu window click-away dismiss](./06-menu-window-dismiss.md) | `platform/windows/menu-dismiss-on-blur` | #23 (single-instance) in `v2-clean` | ✅ Merged (merge commit `1c7c0c2`) |
| 7 | [Notch hover-stuck / retract deadlock fix](./07-notch-retract-verify-fix.md) | `platform/windows/notch-retract-fix` | PR #22 in `v2-clean` | ✅ Merged (merge commit `1b63d37`) |
| 8 | [Orphaned Electron store cleanup](./08-electron-store-cleanup.md) | — (maintenance, no branch) | — | ✅ Done |
| 9 | [Circle leave confirmation dialog](./09-circle-leave-confirmation.md) | `platform/windows/circle-leave-confirmation` | `v2-clean` | 🔄 In review |
| 10 | [Logo assets integration](./10-logo-assets-integration.md) | `platform/windows/logo-assets-integration` | Plan 04 in `v2-clean` | 🔄 In review |

> **Plans 01–07 are merged into `platform/windows/v2-clean`.**
> Phase 2 + Plans 01–05 shipped via PR #12–#16 and PR #22; Plan 06 merged via
> merge commit `1c7c0c2`; Plan 07 merged via merge commit `1b63d37`. The
> `v2-clean` tip is `5e8442c`.
> Plan 05 was implemented in branch `platform/windows/notch-peek-history` and merged via PR #22 (`a72b456`).
> The feature sub-branches for #01–#04 were tagged (`feat/windows-*`) and deleted
> after merge. Plan 05 used `platform/windows/notch-peek-history` and was also
> deleted after merge via PR #22. Plan 06 used `platform/windows/menu-dismiss-on-blur`
> and Plan 07 used `platform/windows/notch-retract-fix`.
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

## Current status (2026-07-04)

- **windows-native-full-build COMPLETE.** Phase 2 + Plans 01–07 all merged into
  `platform/windows/v2-clean` (tip `bdb51aa`); CI green.
- **Post-plan features merged into `v2-clean`:** packaged renderer path fix
  (`3555a62`), near-opaque/darker UI + notch fill (`01b8efa`, `aed3267`), UI
  scrollability fix (PR #21), Circle Presence fix (PR #19), single-instance lock
  fix (PR #23), orphaned Electron store cleanup (Plan 08), and the NSIS one-click
  installer with Start-Menu shortcuts (PR #25) — landed via the
  `installer-shortcuts` PR.
- Per-feature tracking artifacts live in `.planning/phases/{0,A,B,C,D,E}-*/`.

## Next steps / human gates

- **➡️ Review Ponytail audit report:** immediate next task before any large
  architectural cuts or the final PR to `main`. Walk findings #1–#25 in
  [`docs/audits/ponytail-audit-2026-06-30.md`](../../../../docs/audits/ponytail-audit-2026-06-30.md),
  confirm line/dep estimates, decide implement/defer/reject for each, and
  resolve whether Swift/TS shared core (#1) becomes a milestone or stays
  deferred. Record the outcome in
  [`docs/audits/ponytail-audit-review.md`](../../../../docs/audits/ponytail-audit-review.md).
  **No code changes until reviewed.**
- **Final PR to `main`:** human-owned, manually reviewed (see `AGENTS.md` —
  `main` is reached exactly once). Currently still a draft.
- **Manual / QA gates (non-blocking):**
  - Circle Presence 2-person visual confirmation (code fix merged in PR #19).
  - Menu click-away dismiss runtime QA (Plan 06 code merged).
  - Notch auto-hide / retract live-animation QA (Plan 07 code merged).
  - Real GitHub login test, fresh-VM QA, Authenticode signing.
- **Open implementation work:**
  - Ponytail audit review.
  - Auto-update architecture + implementation.
  - Circle leave confirmation dialog (Plan 09 — in review).
  - Complete "Test notch" removal (button already hidden in production; demo
    pipeline still present).
  - Integrate official logo assets (placeholders wired, official assets missing).
- **Backlog:** optional cluster hardening (defense-in-depth, non-blocking).

## Maintenance (2026-06-30)

- **Ponytail audit** (repo-wide complexity review):
  [`docs/audits/ponytail-audit-2026-06-30.md`](../../../../docs/audits/ponytail-audit-2026-06-30.md)
- **Open:** review audit findings and prioritize cuts —
  [`docs/README.md#open-tasks`](../../../../docs/README.md#open-tasks)
