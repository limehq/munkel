# Windows integration — agent execution plans

> **Current position (source of truth):** This file is the single authoritative
> “where are we now” document for the Windows integration. Tip of
> `platform/windows/v2-clean`: **`cc67ea0`** (`Merge pull request #98 from
> rodgi040/platform/windows/ignore-flightplan-payload`). Re-read this banner after
> every `git pull` — the hash changes with merges.
>
> **Not live state:** `.planning/STATE.md`, `.planning/HANDOFF.json`, and
> `.planning/TRACKING.md` are gitignored local handoff artifacts. They may lag
> weeks behind `v2-clean` and must not be treated as instructions to merge branches
> that are already landed. See [Origin-drift reconciliation addendum](#origin-drift-reconciliation-addendum) below when those files cite pre-reconciliation merge hashes.

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
| 14 | [Image Quick-Look overlay (OQ4 / P2.3)](./14-image-preview-overlay.md) | `platform/windows/macos-parity-p1` | Plan 12–13 + upstream `ImagePreviewOverlay` | ✅ Merged in `v2-clean` (macOS-parity hover Quick-Look path; superseded in part by Plan 18 lightbox) |
| — | [Startup performance](./12-startup-performance.md) | `platform/windows/startup-perf` | `v2-clean` | ✅ Merged (`f979110`) |
| 15 | [Notch hover stage-2 preview (WIN-NOTCH-007)](./15-notch-hover-stage2-fix.md) | `platform/windows/notch-hover-stage2-fix` | `v2-clean` | ✅ Implemented in `v2-clean` — human QA pending |
| 16 | [Notch history display fix (WIN-NOTCH-008)](./16-notch-history-display-fix.md) | `platform/windows/notch-history-display-fix` | `v2-clean` | ✅ Implemented / verified in `v2-clean` — human QA pending |
| 17 | [Presence / online status](./17-presence-status.md) | `platform/windows/feature/presence-status` | macOS wire parity | ✅ Merged in `v2-clean` |
| 18 | [Image preview overlay / lightbox](./18-image-preview-overlay.md) | `platform/windows/feature/image-preview-overlay` | Plan 17 | ✅ Merged in `v2-clean` (`526548d`) |

> **Plans 01–11 and post-parity features through Plan 18 are merged into
> `platform/windows/v2-clean`.** Phase 2 + Plans 01–05 shipped via PR #12–#16 and
> PR #22; Plan 06 merged via merge commit `1c7c0c2`; Plan 07 merged via merge
> commit `1b63d37`; Plans 08–11 merged via their respective PRs. Notch-history /
> preview wave landed via PR #47 (`f122fc8`). Presence + lightbox via merge
> `526548d`. Startup perf via `f979110`.
>
> The individual plan files below are **historical execution references** — their
> per-task “next step” wording, branch names, and “create PR / merge” instructions
> reflect the state at authoring time, **not** current work. Do not recreate or
> merge branches named in those files unless this README lists them as open.

## Origin-drift reconciliation addendum

After an origin-drift reconciliation (PR #48, `79f7f39`), several merge hashes
cited in gitignored `.planning/TRACKING.md` / `.planning/PLAN.md` and in older
handoffs are **not ancestors of current `v2-clean`**. The commits still exist
(on `backup/pre-reconcile-78feefd` and related refs) but audits like
`git merge-base --is-ancestor cc5ba84 HEAD` return “no” even though the fixes
are present under new hashes.

Verified from `platform/windows/v2-clean` at tip `cc67ea0`:

| Pre-reconciliation hash | Subject (abbrev.) | Ancestor of HEAD? | Landed on reconciled `v2-clean` as |
|---|---|---|---|
| `4e8def9` | Merge `platform/windows/startup-perf` | **No** | `f979110` (same merge subject) |
| `c927b16` | Merge `platform/windows/notch-lifecycle-harden` | **No** | Content split across `f979110` + `ee5d1dd` (parents were `4e8def9` + `cc5ba84`) |
| `fb0a289` | Merge `platform/windows/notch-history-and-preview-fix` | **No** | `f122fc8` (PR #47) |
| `cc5ba84` | `fix(windows): harden notch hover retract after leave` | **No** | `ee5d1dd` (same subject) |

PR #47 (`f122fc8`) port commits (all ancestors of HEAD):

| Hash | Subject (abbrev.) |
|---|---|
| `7e2ea8b` | show member display names in notch sender label |
| `873ad7e` | append own notch replies to history without stealing newest |
| `a50af19` | harden preview dismiss during reply and skip own echoes |
| `310ea2a` | keep image Quick-Look hittable via shared click-through state |

**Historical branches — do not resume or merge:** `image-preview-overlay`,
`presence-status`, `sendchat-cap-fix`, `update-signature-fix`, `fix-renderer-path`,
`ui-darken`, `installer-shortcuts`. All were already contained in `v2-clean` before
tip `cc67ea0`.

## Agent workflow (every plan)

1. Read `AGENTS.md` (branch rules, no self-merge, no release-please).
2. Read **this README** (current position banner above) before any plan file.
3. Branch from current `v2-clean` for **new** work:
   ```bash
   git fetch origin
   git checkout platform/windows/v2-clean
   git pull origin platform/windows/v2-clean
   git checkout -b platform/windows/<feature>
   ```
4. Read the plan file end-to-end before editing code.
5. Implement tasks **in order**; do not skip verification steps.
6. Run verification commands listed in the plan.
7. Open PR to `platform/windows/v2-clean` with `--repo rodgi040/munkel`.
8. After merge, update **this README** (banner tip hash + status table) in the
   same PR or a follow-up docs PR. Do not treat `.planning/STATE.md` or
   `.planning/HANDOFF.json` as committed truth.

## Fork constraints

- All `gh` commands: `--repo rodgi040/munkel` (not `limehq/munkel`).
- Do not push to `main` or upstream `limehq/munkel`.
- macOS-only verification steps are marked **human** — skip on Windows-only agents.

## Current status (2026-09-08)

- **`platform/windows/v2-clean` tip:** `cc67ea0` — Windows native build, CI, packaging,
  auto-update, notch/preview/presence/lightbox parity, and post-reconciliation fixes
  through PR #98 are merged.
- **Post-plan features merged into `v2-clean`:** packaged renderer path fix
  (`3555a62`), near-opaque/darker UI + notch fill (`01b8efa`, `aed3267`), UI
  scrollability fix (PR #21), Circle Presence fix (PR #19), single-instance lock
  fix (PR #23), orphaned Electron store cleanup (Plan 08), NSIS one-click
  installer with Start-Menu shortcuts (PR #25), circle leave confirmation dialog
  (PR #38), logo assets placeholder pipeline (PR #39), auto-update via
  `electron-updater` (PR #40), notch-history/preview wave (PR #47), presence +
  image lightbox (`526548d`), and subsequent fix PRs #49–#98.

## Next steps / human gates

- **➡️ Final PR to `main`:** human-owned, manually reviewed (see `AGENTS.md` —
  `main` is reached exactly once). Prepare from the current
  `platform/windows/v2-clean` tip (`cc67ea0`).
- **Manual / QA gates (non-blocking):**
  - Circle Presence 2-person visual confirmation (code fix merged in PR #19).
  - Menu click-away dismiss runtime QA (Plan 06 code merged).
  - Notch auto-hide / retract live-animation QA (Plan 07 code merged).
  - WIN-NOTCH-007 / WIN-NOTCH-008 visual QA (Plans 15–16 code merged).
  - Real GitHub login test, fresh-VM QA, Authenticode signing.
- **Open engineering work:** see [`docs/README.md#open-tasks`](../../../../docs/README.md#open-tasks)
  and [`REVIEW-REPORT-2026-09-02.md`](../../../../REVIEW-REPORT-2026-09-02.md)
  for audited code/doc gaps — not the gitignored `.planning/` handoff files.
- **Backlog:** optional cluster hardening (defense-in-depth, non-blocking).

## Maintenance (2026-06-30)

- **Ponytail audit** (repo-wide complexity review):
  [`docs/audits/ponytail-audit-2026-06-30.md`](../../../../docs/audits/ponytail-audit-2026-06-30.md)
- **Open:** review audit findings and prioritize cuts —
  [`docs/README.md#open-tasks`](../../../../docs/README.md#open-tasks)
