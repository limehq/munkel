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
| 9 | [Circle leave confirmation dialog](./09-circle-leave-confirmation.md) | `platform/windows/circle-leave-confirmation` | `v2-clean` | ✅ Merged |
| 10 | [Logo assets integration](./10-logo-assets-integration.md) | `platform/windows/logo-assets-integration` | Plan 04 in `v2-clean` | ✅ Merged |
| 11 | [Auto-update](./11-auto-update.md) | `platform/windows/auto-update` | `v2-clean` | ✅ Merged (PR #40) |
| 12 | [macOS feature parity (matrix + P1–P3)](./12-macos-feature-parity.md) | `platform/windows/macos-parity-p1` | #11 branch stack | 🔄 Matrix **38 DONE / 1 PARTIAL / 0 MISSING / 1 BLOCKED** (2026-07-18) — P2.3/OQ4 DONE via Plan 14; only P2.2/OQ5 (CLI installer) still blocked; echo toggle default tightened to opt-in `false` |
| 13 | [Remaining parity: dev toggles, ticker, hardening](./13-remaining-parity.md) | `platform/windows/macos-parity-p1` | Plan 12 | ✅ Autonomous items done (2026-07-10) — ticker, screenshots toggle, echo toggle (default later flipped to opt-in `false` on 2026-07-18); P2.2 remains BLOCKED on OQ5; P2.3 moved to Plan 14 |
| 14 | [Image Quick-Look overlay (OQ4 / P2.3)](./14-image-preview-overlay.md) | `platform/windows/macos-parity-p1` | Plan 12–13 + upstream `ImagePreviewOverlay` | ✅ Implemented (2026-07-17) — hover Quick-Look, wide notch, blob-download; uncommitted; manual QA checklist partially open |

> **Plans 01–11 are merged into `platform/windows/v2-clean`.**
> Phase 2 + Plans 01–05 shipped via PR #12–#16 and PR #22; Plan 06 merged via
> merge commit `1c7c0c2`; Plan 07 merged via merge commit `1b63d37`; Plans 08–11
> merged via their respective PRs. The `v2-clean` tip is `0272dee`.
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

## Current status (2026-07-06)

- **windows-native-full-build COMPLETE.** Phase 2 + Plans 01–11 all merged into
  `platform/windows/v2-clean` (tip `0272dee`); CI green.
- **Post-plan features merged into `v2-clean`:** packaged renderer path fix
  (`3555a62`), near-opaque/darker UI + notch fill (`01b8efa`, `aed3267`), UI
  scrollability fix (PR #21), Circle Presence fix (PR #19), single-instance lock
  fix (PR #23), orphaned Electron store cleanup (Plan 08), NSIS one-click
  installer with Start-Menu shortcuts (PR #25), circle leave confirmation dialog
  (PR #38), logo assets placeholder pipeline (PR #39), and auto-update via
  `electron-updater` (PR #40).
- Per-feature tracking artifacts live in `.planning/phases/{0,A,B,C,D,E}-*/`.

## Next steps / human gates

- **➡️ Final PR to `main`:** human-owned, manually reviewed (see `AGENTS.md` —
  `main` is reached exactly once). No draft PR currently exists; it needs to be
  prepared from the current `platform/windows/v2-clean` tip (`0272dee`).
- **Manual / QA gates (non-blocking):**
  - Circle Presence 2-person visual confirmation (code fix merged in PR #19).
  - Menu click-away dismiss runtime QA (Plan 06 code merged).
  - Notch auto-hide / retract live-animation QA (Plan 07 code merged).
  - Real GitHub login test, fresh-VM QA, Authenticode signing.
- **Open implementation work:**
  - Notch regressions reported 2026-07-06: vertical oversize, missing peek-phase
    loading ring, and hover-reopen not working. Tracked in
    [`docs/bugs/windows-notch-regression-2026-07-06.md`](../../../../docs/bugs/windows-notch-regression-2026-07-06.md)
    and `docs/README.md#open-tasks`.
- **Backlog:** optional cluster hardening (defense-in-depth, non-blocking).

## Maintenance (2026-06-30)

- **Ponytail audit** (repo-wide complexity review):
  [`docs/audits/ponytail-audit-2026-06-30.md`](../../../../docs/audits/ponytail-audit-2026-06-30.md)
- **Open:** review audit findings and prioritize cuts —
  [`docs/README.md#open-tasks`](../../../../docs/README.md#open-tasks)
