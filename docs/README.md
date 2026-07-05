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

> **Ponytail audit quick wins — DONE**
>
> - **Outcome:** All implementable quick-win findings are merged into `platform/windows/v2-clean`. Deferred: #1 (Swift/TS shared core, post-`main` milestone), #8 (window factories, after scratchpad drafts), #12 (Unix socket client, after transport settles), #24 (landing Button refactor, UI refresh). Rejected: #18 (keep `Logger` abstraction).
> - **Next:** Update the audit review doc status and proceed with the remaining open tasks below.

## Open tasks

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| **Implement [Ponytail audit](./audits/ponytail-audit-2026-06-30.md) quick wins** | Done | — | All implementable findings merged via PRs #31, #33, #34, #35, #36. Deferred: #1, #8, #12, #24. Rejected: #18. See [`ponytail-implementation-tracker.md`](../.planning/ponytail-implementation-tracker.md) for details. |
| **Fix [Windows notch UX bugs](./bugs/windows-notch-ux-2026-06-30.md)** | Fixed | — | All P0–P2 issues (WIN-NOTCH-001/002/003) are addressed. Plan 05 (history/peek, PR #22), Plan 06 (menu click-away dismiss, merge `1c7c0c2`), and Plan 07 (hover-stuck retract deadlock, merge `1b63d37`) are merged into `platform/windows/v2-clean`. See the bug doc for details. |
| **Remove "Test notch" demo pipeline** | Done | — | Demo pipeline removed: `runNotchDemo`, `test-notch` IPC, preload/types bindings, renderer button, and doc references. Real notch behavior is untouched. |
| **Integrate official logo assets** | Done | — | Placeholder pipeline is in place: `apps/windows/assets/logo.svg` is the canonical source and feeds `render-ico` + `render-tray-icon`. Official assets only need to replace `logo.svg` and rerun the render scripts. |
| **Implement auto-update** | Open | — | Architecture and implementation not started. Decide on update provider (e.g., `electron-updater`), release feed, and code-signing flow. |
| **Circle leave confirmation dialog** | Done | — | Merged via PR #38 (`803f0fc`). Frosted confirmation mini-popup with Leave/Cancel, Escape/backdrop dismissal, focus trap, and ARIA attributes. |
| **Hand over NSIS installer to `main`** | Partially done | — | NSIS one-click installer with Start-Menu shortcuts is merged into `platform/windows/v2-clean` (PR #25). The PR from the Windows integration branch to `main` is still a draft. |
| **Circle Presence 2-person visual confirmation** | Manual/QA gate | — | Code fix is merged (PR #19). Final visual confirmation with a second person is still outstanding. |
| **Manual QA: menu click-away dismiss** | Manual/QA gate | — | Plan 06 code merged; live Windows runtime validation required. |
| **Manual QA: notch auto-hide/retract sequence** | Manual/QA gate | — | Plan 07 code merged; live animation QA on Windows required. |

> **Note:** Execution Plans 05–07 are merged into `platform/windows/v2-clean`.
