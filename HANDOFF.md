# Handoff — munkel (2026-08-18)

> **Wiederaufsetz-Punkt (2026-08-18) — Origin-Drift-Follow-up lokal grün; Branch committen+pushen, PR als Nächstes, kein Merge.**
> Ältere Abschnitte (2026-07-22) bleiben historischer Record.

> **Wiederaufsetz-Punkt (2026-08-17) — Git-Reconciliation abgeschlossen, PR #47 offen.**
> Die Abschnitte direkt unten sind maßgeblich. Ältere (2026-07-22 und davor) bleiben historischer Record.

## current_state

- **Branch:** `platform/windows/origin-drift-fix` off `origin/platform/windows/v2-clean` (`1109002`).
- **Scope:** Origin-Drift nach `upstream/main`-Sync (`94bc0b8`) + Integration-Merge (`8abd1b4`): Typecheck + 29 pre-existing Testfehler auf der v2-clean-Basis.
- **Lokal verifiziert:** `bunx tsc --noEmit` grün; `bun test` in `apps/windows` = **654 pass / 0 fail** (vorher 625 pass / 29 fail).
- **PR #47** bleibt separat offen: `platform/windows/notch-history-and-preview-fix` → `v2-clean`
  (https://github.com/rodgi040/munkel/pull/47). CI dort rot wegen desselben `identity-store` Typechecks, bis diese Basis landet und #47 rebased wird. Kein Self-Merge.

## completed (diese Session)

1. Feature-Branch `platform/windows/origin-drift-fix` von `origin/platform/windows/v2-clean` angelegt.
2. Typecheck: `PersistedState.version` Literal `1` → `1 | 2` (`identity-store.ts`), Runtime schreibt `version: 2`.
3. Payload-Tests an `shared-wire` angeglichen: fehlender Profil-`status` bleibt `undefined`; unbekannte Werte fallen weiter auf `'online'`.
4. GroupSession-Echo-Test: echter Fehlschlag via Disconnect (`Circle offline`), nicht mehr 60k-Plaintext (wird auf `MAX_CHAT_CHARS` gekürzt). Truncation-Test unangetastet.
5. NotchWidget-Wiring, das der `macos-parity`-Merge verloren hatte:
   - Root: `ref={widgetRef}`, `data-testid="notch-widget"`, `setNotchHovered` + `onMouseMove={reportHoverCopyActivity}`.
   - History-Rows: `{ collapsible: true }`; Full-View: `{ pulse: !replyingTo }`.
6. Hover-Reopen: `reopenFromHoverTarget` setzt `ui === 'open'` (History), auch während `phase === 'full'` — macOS-Parity / Plan-12/13-NotchWidget-Tests. Lifecycle-Tests umbenannt/angepasst.
7. Kein PR-#47-Feature portiert (Sender-Namen, Own-Reply, Quick-Look bleiben dort).

## remaining (in Reihenfolge)

1. **PR öffnen** `origin-drift-fix` → `v2-clean` (kein Self-Merge).
2. **PR #47** auf die neue `v2-clean`-Basis rebasen, sobald dieser PR gemerged ist (sonst bleibt #47-CI am Typecheck rot).
3. **OQ5** (CLI-Distribution) — blockierte Produktentscheidung.
4. Upstream limehq/munkel#80 — human review, kein Self-Merge.

## decisions

- Origin-Drift als eigener Sub-Branch off `v2-clean`, nicht in PR #47 mischen (User/HANDOFF 2026-08-17).
- Payload/Echo: Tests an den Wire-Vertrag anpassen, Production-Encode/Decode und Chat-Truncation nicht zurückdrehen.
- NotchWidget: fehlendes Wiring vorhandener Handler/Optionen wieder anschließen (`ref`, Hover-Copy, `collapsible`, `pulse`) — kein Copy der PR-#47-Features.
- Hover-Reopen-Vertrag: Plan-12/13-NotchWidget-Tests (History sofort) schlagen die origin-3-State-Lifecycle-Tests (`ui === 'preview'` zuerst). Lifecycle-Tests an `open` angepasst. `openFromPreview()` bleibt idempotent.
- Untracked gelassen: `Debugging/`, `apps/windows/docs/plans/15-startup-performance.md`, Vite-Timestamp, `kimi-export-session_*.md`.

## blockers

- Keine harten. ReMe-Tunnel war in der Session down (`ConnectError` 127.0.0.1:2333) — Resume lief über Repo-Dateien.
- PR #47 CI bleibt rot, bis dieser Typecheck auf `v2-clean` liegt.

## next_action

PR `platform/windows/origin-drift-fix` → `platform/windows/v2-clean` öffnen (`gh pr create --repo rodgi040/munkel`). Nicht mergen. Danach #47 rebase.

---

- **Reconciliation DONE + PR offen:** lokaler divergierter `v2-clean` (9 ahead / 111 behind origin) auf
  frischen `origin/platform/windows/v2-clean` (`1109002`) überführt, **nichts verloren**.
- **Feature-Branch:** `platform/windows/notch-history-and-preview-fix` — **gepusht**, **PR #47** →
  `v2-clean` (https://github.com/rodgi040/munkel/pull/47, kein Self-Merge).
- **Backup-Refs:** `backup/pre-reconcile-78feefd` + Tag `backup/pre-reconcile-2026-08-17` (→ `78feefd`).
- **6 Commits** (5 Code + 1 Docs `1a3894d`). Code: `7ef1048`…`a50af19` (siehe completed).

## completed (diese Session)

1. **Phase 0 Backup:** `backup/pre-reconcile-78feefd` + Tag (→ `78feefd`).
2. **Phase 1 Audit (Cursor-Subagent):** `scratchpad/reconcile-manifest.md` — exaktes Re-Apply-Manifest.
   Befund: origin hat Großteil von `cc5ba84` schon (P1.3 + `ee5d1dd`); Sender besser via Parallel-Branch `b5bacc8`.
3. **Phase 2 Implementation (Cursor-Subagent):** Fresh-Branch + 5 Code-Commits:
   `7ef1048` collapsed-Resize (← cc5ba84) · `7e2ea8b` Sender (← b5bacc8) · `873ad7e` Own-Reply (← a3f3966) ·
   `310ea2a` Quick-Look (← bffcbee) · `a50af19` Preview-Dismiss+Echo-Skip (← 9e4165c).
4. **Phase 3 Verifikation:** Baseline-Vergleich (origin-Tip vs Branch) → 0 neue Fehler, 7 pre-existing behoben, +20 Tests.
5. **Phase 4:** Docs (HANDOFF/STATE/NOTE) committet (`1a3894d`), Branch gepusht, PR #47 offen.

## remaining (in Reihenfolge)

1. **Origin-Drift-Follow-up (offen):** origin-Basis rot — 22 pre-existing Testfehler + 2 typecheck-Fehler
   (`identity-store.ts` `version`-Typ-Drift) aus `upstream/main`-Sync (`94bc0b8`) + Integration-Merge
   (`8abd1b4`). Eigener Debugging-Auftrag (NOTE.md).
2. **PR #47:** Review/CI abwarten; kein Self-Merge.
3. **OQ5** (CLI-Distribution) — blockierte Produktentscheidung.

## decisions

- **Umfang „alles wiederherstellen"** (User): 3 Feature-Commits + `cc5ba84`-unique Geometrie/Hit-Targets/Dead-Code.
- **Sender via `b5bacc8` + Own-Reply-Port** (User bestätigt): Parallel-Branch ist die bessere Sender-Impl.
  (shared `member-label.ts`); unser `a3f3966`-Sender-Teil redundant → nur Own-Reply portiert.
- **Fresh-Branch + Re-Apply statt rebase/merge** der 9er-Kette (Duplicate-Merges; `cc5ba84`/`a3f3966` nicht wholesale).
- **Origin-Drift = separater Follow-up**, nicht Teil der Reconciliation (User: „Reconciliation abschließen").

## blockers

- Keine harten. Origin-Drift (22 Tests + typecheck) macht CI rot, ist aber pre-existing (eigener Auftrag).

## next_action

Origin-Drift-Follow-up: 22 pre-existing Testfehler + `identity-store.ts`-typecheck auf
`platform/windows/v2-clean` untersuchen/fixen (Root Cause: `upstream/main`-Sync `94bc0b8` +
origin-`macos-parity`-Tree-Drift `3ed68fa`).

## suggested_skills

- `/fp-resume` (Wiederaufsetz)
- `/fp-pause` / `/fp-resume` (Wiederaufsetz)
- `gh pr create` gegen `platform/windows/v2-clean` (`--repo rodgi040/munkel`)
- Nicht auf `main` pushen.

---

## current_state (2026-07-22, origin-Record)

- **Branch:** `platform/windows/v2-clean` (synced with `platform/windows-integration` + `upstream/main`).
- **Contribution PR:** https://github.com/limehq/munkel/pull/80 — **MERGEABLE** (may be BLOCKED on reviews/checks).
- **Focus:** Windows contribution ready for upstream review.

## remaining (historisch, teilweise überholt)

Notch Aufgabe 2/3 (Sender-Namen, Own-Reply) leben in **PR #47**, nicht mehr als offene Coding-Tasks auf v2-clean.
