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

> **NSIS installer handover to `main`**
>
> - **Status:** Installer code is merged into `platform/windows/v2-clean` (PR #25). No draft PR currently exists. The next step is to prepare the final human-reviewed PR from `platform/windows/v2-clean` to `main`.
> - **Context:** All Ponytail audit quick wins are implemented; only deferred/rejected findings remain. Auto-update and circle-leave confirmation are complete. Logo assets may be resolved by the brand SVG already present on `main` (`apps/landing/public/favicon.svg`).

## Open tasks

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| **Implement [Ponytail audit](./audits/ponytail-audit-2026-06-30.md) quick wins** | Done | — | All implementable findings merged via PRs #31, #33, #34, #35, #36. Deferred: #1 (Swift/TS shared core, post-`main` milestone), #8 (window factories, after scratchpad drafts), #12 (Unix socket client, after transport settles), #24 (landing Button refactor, UI refresh). Rejected: #18 (keep `Logger` abstraction). See [`ponytail-implementation-tracker.md`](../.planning/ponytail-implementation-tracker.md) for details. |
| **Fix [Windows notch UX bugs](./bugs/windows-notch-ux-2026-06-30.md)** | Fixed | — | All P0–P2 issues (WIN-NOTCH-001/002/003) are addressed. Plan 05 (history/peek, PR #22), Plan 06 (menu click-away dismiss, merge `1c7c0c2`), and Plan 07 (hover-stuck retract deadlock, merge `1b63d37`) are merged into `platform/windows/v2-clean`. See the bug doc for details. |
| **Remove "Test notch" demo pipeline** | Done | — | Demo pipeline removed from code: `runNotchDemo`, `test-notch` IPC, preload/types bindings, renderer button. A few historical plan references remain in `apps/windows/docs/plans/02-github-oauth-windows.md` and `apps/windows/docs/plans/README.md`. Real notch behavior is untouched. |
| **Integrate official logo assets** | Done (placeholder) | — | SVG from `main` (`apps/landing/public/favicon.svg`) copied to `apps/windows/assets/logo.svg` as a temporary stand-in. Icon (`assets/icon.ico`) and tray images (`tray-icon*.png`) regenerated. Verified via `bun run typecheck`, `bun test`, `bun run build`, and `bun run pack:dir`. **⚠️ The final correct brand logo is pending and must replace `assets/logo.svg` when delivered.** |
| **Implement auto-update** | Done | — | Implemented via `electron-updater` with GitHub Releases feed (`rodgi040/munkel`). Auto-check on launch and every 24h; user-consent install; dev-mode skip; signature-verification disabled for unsigned beta with TODO to re-enable after Authenticode signing. See Plan 11 / PR #40. |
| **Circle leave confirmation dialog** | Done | — | Merged via PR #38 (`803f0fc`). Frosted confirmation mini-popup with Leave/Cancel, Escape/backdrop dismissal, focus trap, and ARIA attributes. |
| **Hand over NSIS installer to `main`** | Partially done | — | NSIS one-click installer with Start Menu shortcuts is merged into `platform/windows/v2-clean` (PR #25). No draft PR to `main` currently exists; the final human-reviewed PR needs to be prepared. |
| **Fix notch vertical oversize (WIN-NOTCH-004)** | Open | — | Notch renders too tall, showing multiple vertical frame/box artefacts below a single message. See [`docs/bugs/windows-notch-regression-2026-07-06.md`](./bugs/windows-notch-regression-2026-07-06.md). |
| **Fix notch peek loading ring (WIN-NOTCH-005)** | Open | — | Loading/activity ring is not visible during the peek phase. See [`docs/bugs/windows-notch-regression-2026-07-06.md`](./bugs/windows-notch-regression-2026-07-06.md). |
| **Fix notch hover reopen (WIN-NOTCH-006)** | Open | — | Hovering the retracted notch does not reopen it. See [`docs/bugs/windows-notch-regression-2026-07-06.md`](./bugs/windows-notch-regression-2026-07-06.md). |
| **Circle Presence 2-person visual confirmation** | Manual/QA gate | — | Code fix is merged (PR #19). Final visual confirmation with a second person is still outstanding. |
| **Manual QA: menu click-away dismiss** | Manual/QA gate | — | Plan 06 code merged; live Windows runtime validation required. |
| **Manual QA: notch auto-hide/retract sequence** | Manual/QA gate | — | Plan 07 code merged; live animation QA on Windows required. |

> **Note:** Execution Plans 05–07 are merged into `platform/windows/v2-clean`.
