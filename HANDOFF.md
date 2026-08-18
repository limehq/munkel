# Handoff — munkel (2026-07-22)

> **Wiederaufsetz-Punkt (2026-08-17) — Git-Reconciliation abgeschlossen.** Die Abschnitte direkt
> unten sind maßgeblich. Ältere (2026-07-22 und davor) bleiben historischer Record.

## current_state (2026-08-17)

- **Reconciliation DONE:** lokaler divergierter `v2-clean` (9 ahead / 111 behind origin) auf frischen
  `origin/platform/windows/v2-clean` (`1109002`) überführt, **nichts verloren**.
- **Feature-Branch:** `platform/windows/notch-history-and-preview-fix` (off `1109002`, 5 Commits,
  **nicht gepusht**). Alter lokaler Feature-Branch umbenannt → `…-pre-reconcile`.
- **Backup-Refs:** `backup/pre-reconcile-78feefd` + Tag `backup/pre-reconcile-2026-08-17` (beide `78feefd`).
- **5 Commits:** `7ef1048` (collapsed resize footprint ← cc5ba84) · `7e2ea8b` (sender display names ← b5bacc8) ·
  `873ad7e` (own replies ← a3f3966) · `310ea2a` (Quick-Look hittable ← bffcbee) · `a50af19` (preview dismiss + echo skip ← 9e4165c).
- **Verifikation:** 0 neue Testfehler, 7 pre-existing Fehler behoben, +20 neue Tests. Details: `scratchpad/reconcile-manifest.md`.

## remaining (2026-08-17)

1. **Follow-up (offen):** origin-Basis ist rot — 22 pre-existing Testfehler + 2 typecheck-Fehler
   (`identity-store.ts` `version`-Typ-Drift), aus `upstream/main`-Sync (`94bc0b8`) + Integration-Merge
   (`8abd1b4`). Separater Debugging-Auftrag (siehe NOTE.md).
2. **Push/PR-Entscheid:** Feature-Branch nach `origin` pushen und PR → `v2-clean` (kein Self-Merge, Fork `rodgi040/munkel`).

## blockers

- Keine harten. Origin-Drift (22 Tests + typecheck) blockiert ein grünes CI, ist aber pre-existing und
  nicht Teil der Reconciliation.

---

## current_state (2026-07-22, origin-Record)

- **Branch:** `platform/windows/v2-clean` (synced with `platform/windows-integration` + `upstream/main`).
- **Contribution PR:** https://github.com/limehq/munkel/pull/80 — **MERGEABLE** (may be BLOCKED on reviews/checks).
- **Focus:** Windows contribution ready for upstream review.

## completed

1. Merged remaining feature branches into `v2-clean` (macos-parity-p1, startup-perf, lifecycle harden, prior security/docs/fixes).
2. Created `platform/windows-integration`, merged `upstream/main`, resolved conflicts.
3. Pushed `v2-clean` + `windows-integration` + feature tags; PR #80 tip refreshed → mergeable.
4. Fork PRs #41–#44 already merged into `v2-clean`.

## remaining

1. Human review / CI gates on limehq/munkel#80 (do not self-merge upstream).
2. Notch Aufgabe 2: sender shows IDs instead of display names.
3. Notch Aufgabe 3: own sent reply missing from notch history.
4. Optional: live Windows QA for notch hover → leave → retract.

## next_action

Wait for upstream review on PR #80, or start Notch Aufgabe 2 (sender display names) on a new feature sub-branch off `v2-clean`.
