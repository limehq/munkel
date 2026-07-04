# Project documentation

Index of maintained documentation for the munkel monorepo.

## Guides

| Document | Description |
|----------|-------------|
| [Launch platforms](./launch-platforms.md) | Where Munkel launches; badge track for the landing page |

## Windows integration

Windows-specific plans and contracts live under
[`apps/windows/docs/`](../apps/windows/docs/):

- [Execution plans index](../apps/windows/docs/plans/README.md)
- [IPC contract](../apps/windows/docs/ipc-contract.md)
- [UI spec](../apps/windows/docs/ui-spec.md)

## Audits

| Document | Date | Description |
|----------|------|-------------|
| [Ponytail audit](./audits/ponytail-audit-2026-06-30.md) | 2026-06-30 | Repo-wide over-engineering / complexity audit |

## Bugs

| Document | Date | Description |
|----------|------|-------------|
| [Windows notch UX](./bugs/windows-notch-ux-2026-06-30.md) | 2026-06-30 | Oversized notch, missing message history, broken reply/send (WIN-NOTCH-001–003) |

---

## Next task

> **Review the [Ponytail audit report](./audits/ponytail-audit-2026-06-30.md)**
>
> - **Goal:** Walk findings #1–#25, confirm line/dep estimates, decide which cuts to implement vs. defer/reject, and resolve whether the Swift/TS shared core (#1) becomes a milestone or stays deferred.
> - **Why now:** Blocks the scope and timeline for the final PR to `main`. The audit itself mandates: *"No code changes until reviewed."*
> - **Acceptance criteria:** A written decision list is recorded in the audit doc or a new review file; no implementation branches are opened until the review is complete.

## Open tasks

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| **➡️ Review [ponytail audit report](./audits/ponytail-audit-2026-06-30.md)** | Open / Next | — | Walk findings #1–#25; confirm line/dep estimates; decide which cuts to implement and in what order; resolve whether Swift/TS shared core (#1) becomes a milestone or stays deferred. No code changes until reviewed. |
| **Fix [Windows notch UX bugs](./bugs/windows-notch-ux-2026-06-30.md)** | Fixed | — | All P0–P2 issues (WIN-NOTCH-001/002/003) are addressed. Plan 05 (history/peek, PR #22), Plan 06 (menu click-away dismiss, merge `1c7c0c2`), and Plan 07 (hover-stuck retract deadlock, merge `1b63d37`) are merged into `platform/windows/v2-clean`. See the bug doc for details. |
| **Remove "Test notch" demo pipeline** | Partially done | — | Button is hidden in production builds, but the full demo pipeline (`runNotchDemo`, IPC, types, docs) is still present and should be removed before release. |
| **Integrate official logo assets** | Partially done | — | Placeholder assets are wired throughout the app, tray, and installer. Official logo assets are still missing. |
| **Implement auto-update** | Open | — | Architecture and implementation not started. Decide on update provider (e.g., `electron-updater`), release feed, and code-signing flow. |
| **Circle leave confirmation dialog** | Open | — | Show a confirmation mini-popup before the user leaves a Circle to prevent accidental exits. |
| **Hand over NSIS installer to `main`** | Partially done | — | NSIS one-click installer with Start-Menu shortcuts is merged into `platform/windows/v2-clean` (PR #25). The PR from the Windows integration branch to `main` is still a draft. |
| **Circle Presence 2-person visual confirmation** | Manual/QA gate | — | Code fix is merged (PR #19). Final visual confirmation with a second person is still outstanding. |
| **Manual QA: menu click-away dismiss** | Manual/QA gate | — | Plan 06 code merged; live Windows runtime validation required. |
| **Manual QA: notch auto-hide/retract sequence** | Manual/QA gate | — | Plan 07 code merged; live animation QA on Windows required. |

> **Note:** Execution Plans 05–07 are merged into `platform/windows/v2-clean`.
