# NOTE

## Inbox (unsorted)

- 2026-08-17 **[done]** Git-Divergenz-Reconciliation `v2-clean`: lokalen divergierten Stand (9 ahead / 111 behind origin) sauber auf frischen `origin/platform/windows/v2-clean` überführt, nichts verloren. Ergebnis: Feature-Branch `platform/windows/notch-history-and-preview-fix` (off origin-Tip `1109002`) mit 5 Commits. Siehe `scratchpad/reconcile-manifest.md`.
- 2026-08-17 **[follow-up, offen]** **origin-Basis ist rot (pre-existing, NICHT von der Reconciliation):** `bun test` auf origin-Tip `1109002` = **29 fail**; `bun run typecheck` = 2 Fehler in `apps/windows/src/main/identity-store.ts`. Ursache: `upstream/main`-Sync (`94bc0b8`) + `platform/windows-integration`-Merge (`8abd1b4`) bzw. origin-`macos-parity`-Merge `3ed68fa` (anderer Tree als lokaler `2ec7763`). Betroffen: `identity-store.ts` `version:1`-Literal vs `version:2` (Typ-Drift), 2 Payload-Encoding-Tests, 1 GroupSession-dev-echo, 19 NotchWidget-Tests (hover-copy P3.2, history expand/collapse P3.6, Ticker, Sent-to, reply-prune, avatar-pulse). Eigener Debugging-Auftrag nötig.

## Classified

| Topic | Type | Status | Target/Source | Decision | Defined-on | Done-on/How |
|---|---|---|---|---|---|---|
| Git-Divergenz v2-clean (9/111) | task | done | Reconcile lokal → origin | Fresh-Branch + Re-Apply (nicht rebase/merge der 9er-Kette); Sender via `b5bacc8` + Own-Reply-Port | 2026-08-17 | 2026-08-17 / 5 Commits `7ef1048`..`a50af19`, 0 neue Fehler, 7 pre-existing behoben |
| origin-Testdrift (22 fail + typecheck) | bug | open | origin `1109002` (upstream-Sync) | Separater Follow-up-Auftrag | 2026-08-17 | — |
