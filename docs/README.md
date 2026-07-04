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

## Open tasks

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| **Review [ponytail audit report](./audits/ponytail-audit-2026-06-30.md)** | Open | — | Walk findings #1–#25; confirm line/dep estimates; decide which cuts to implement and in what order; resolve whether Swift/TS shared core (#1) becomes a milestone or stays deferred. No code changes until reviewed. |
| **Fix [Windows notch UX bugs](./bugs/windows-notch-ux-2026-06-30.md)** | Fixed | — | All P0–P2 issues (WIN-NOTCH-001/002/003) are addressed. Plan 05 (history/peek, PR #22), Plan 06 (menu click-away dismiss, merge `1c7c0c2`), and Plan 07 (hover-stuck retract deadlock, merge `1b63d37`) are merged into `platform/windows/v2-clean`. See the bug doc for details. |
