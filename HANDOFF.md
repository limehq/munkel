# Handoff — munkel (2026-07-06)

## current_state

- **Aktueller Branch:** `platform/windows/v2-clean` (Tip: `0272dee`).
- **Working directory:** `C:/Users/rodgi/CODING/Test/munkel` — funktioniert normal.
- **Session aktiv:** Doku-Aktualisierung und Logo-Analyse in Arbeit.

## Abgeschlossen in dieser Session

### 1. Circle-Leave-Bestätigungsdialog — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/circle-leave-confirmation`
- **PR:** #38 → Merge-Commit `803f0fc` in `platform/windows/v2-clean`
- **Tag:** `feat/windows-circle-leave-confirmation`

### 2. Logo-Assets-Pipeline — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/logo-assets-integration`
- **PR:** #39 → Merge-Commit `7787cc0` in `platform/windows/v2-clean`
- **Tag:** `feat/windows-logo-assets-pipeline`

### 3. Auto-Update (electron-updater) — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/auto-update`
- **PR:** #40 → Merge-Commit `92b06f4` in `platform/windows/v2-clean`
- **Zusätzlicher Fix-Commit:** `26bb5bb`
- **Tag:** `feat/windows-auto-update`

### 4. Branch-Aufräumung `platform/windows/auto-update`
- Lokaler und remote Branch `platform/windows/auto-update` gelöscht.
- Working Tree auf `platform/windows/v2-clean` (`0272dee`) synchronisiert.
- Verifikation: typecheck, build, tests grün.

### 5. Ponytail-Audit-Status verifiziert
- 19/25 Findings implementiert (PRs #31, #33–#36).
- 4 deferred (#1, #8, #12, #24), 1 rejected (#18), 0 offen.

### 6. Dokumentation und Logo-Assets aktualisiert
- `docs/README.md`: Ponytail-Audit als Done, Auto-Update als Done, Logo-Assets als Done, NSIS-Handover-Status korrigiert.
- `apps/windows/docs/plans/README.md`: Plan 11 als Merged, `v2-clean` tip auf `0272dee`, Next Steps aktualisiert, Logo-Assets aus offener Arbeit entfernt.
- `HANDOFF.md`: Veraltete Blocker entfernt, aktueller Stand reflektiert.
- `apps/windows/README.md`: Logo-Assets-Section aktualisiert.
- Brand-Logo von `main` (`apps/landing/public/favicon.svg`) nach `apps/windows/assets/logo.svg` kopiert.
- `icon.ico` und `tray-icon*.png` neu gerendert.
- ⚠️ **Das aktuelle `logo.svg` ist ein vorläufiges Stand-in.** Das endgültige korrekte Brand-Logo ist noch pending und muss `apps/windows/assets/logo.svg` ersetzen, sobald es zugestellt wird.
- Verifikation: `bun run typecheck`, `bun test` (195/2/0), `bun run build`, `bun run pack:dir` grün.

## Offene Punkte

### 1. NSIS-Installer an `main` übergeben — PENDING
- **Status:** NSIS-Installer mit Start Menu shortcuts ist in `platform/windows/v2-clean` (PR #25). Kein Draft-PR zu `main` existiert aktuell.
- **AGENTS.md:** `main` darf nur einmal am Ende via manuell reviewed PR erreicht werden.
- **Nächster Schritt:** Diff `v2-clean` ↔ `main` analysieren, Draft-PR erstellen/prüfen, Handover-Checkliste erstellen.

### 2. Notch-Regressionen dokumentieren und beheben — PENDING
Neue Notch-Bugs aus manuellem QA am 2026-07-06:
- **WIN-NOTCH-004:** Notch wird vertikal zu groß dargestellt (mehrere Kasten/Frames unter der Nachricht).
- **WIN-NOTCH-005:** Ladekreis/Ring in der Peek-Phase ist nicht sichtbar.
- **WIN-NOTCH-006:** Hover über die eingefahrene Notch öffnet sie nicht wieder.
- **Dokumentation:** [`docs/bugs/windows-notch-regression-2026-07-06.md`](../../docs/bugs/windows-notch-regression-2026-07-06.md)
- **Nächster Schritt:** Reproduzieren, technische Diagnose, anschließend Fix + QA.

### 3. Manuelle QA-Gates dokumentieren — PENDING
- **Circle Presence 2-Personen-Visueller-Check**
- **Menü click-away dismiss**
- **Notch auto-hide/retract** (teilweise durch WIN-NOTCH-004/005/006 abgedeckt)
- **Nächster Schritt:** Strukturierte QA-Testpläne/Checklisten in der Dokumentation anlegen.

## Offene Pull Requests

- PR #41: `platform/windows/docs-logo-update` → `platform/windows/v2-clean` (Doku-Sync + offizielles Logo).
- Kein Draft-PR `v2-clean` → `main` vorhanden.

## Tags dieser Session

- `feat/windows-circle-leave-confirmation`
- `feat/windows-logo-assets-pipeline`
- `feat/windows-auto-update`

## Branches dieser Session (remote gelöscht)

- `platform/windows/circle-leave-confirmation`
- `platform/windows/logo-assets-integration`
- `platform/windows/auto-update`

## Blocker

- Keine harten Blocker.

## Nächste Schritte

1. PR #41 mergen (nach Review).
2. NSIS-Handover-Planung starten.
3. Manuelle QA-Gates dokumentieren.

---

# Handoff — munkel (2026-07-03)

[Previous handoff content preserved below]

## current_state

- **Aktueller Branch:** `platform/windows/v2-clean` (enthält den Single-Instance-Fix via Merge `50998af`).
- **Working-Tree:** `IDEAS.md` + `apps/windows/docs/plans/README.md` sind **modifiziert/gestaged, aber NICHT committet** (fp-note-Notizen — bewusst uncommitted). Untracked Streu-Dateien: `HANDOFF.md`, `docs/README.md`, `docs/audits/`, `docs/bugs/`, `untitled.pen`.
- **Dev-Server läuft** (~13 `electron.exe` + node): die Launcher-Test-Instanz vom Self-Heal-Test ist noch aktiv. Stoppen: App via Tray→Quit + minimiertes Konsolenfenster schließen, oder `Get-Process electron | Stop-Process -Force` + den `dev.mjs`-node-Prozess killen.
- **Zwei Feature-Stränge dieser Session-Kette:**
  1. **Single-Instance/Self-Heal** — KOMPLETT DURCH: PR #23 gemerged, getaggt, Branch gelöscht. ✅
  2. **Notch Peek/History** — PR #22 (`platform/windows/notch-peek-history`) **noch OFFEN**, QA unvollständig (siehe remaining).

## completed (diese Session)

### 1. Single-Instance-Lock + Self-Heal (Windows) — DONE, gemerged, getaggt
- **Root-Cause belegt** (Codex gpt-5.5, Report `scratchpad/wm-circle-drop-analysis.md`): Circle „wm" ging offline, weil **zwei Munkel-Prozesse** (Dev + alter installierter Build 28.06.) mit **derselben `memberId 602a0e2c…`** liefen → gegenseitige Relay-Verdrängung (`core/protocol.ts:14-18`: neue Verbindung gleicher memberId ersetzt alte still) → Flapping `close-1006→reconnect→open`.
- **Windows-Recherche belegt:** Electron-Lock keyt auf den **`userData`-Pfad** (Message-Window-Titel, case-insensitiv), NICHT auf appId/AppUserModelId. `%APPDATA%\munkel` == `%APPDATA%\Munkel` = derselbe Lock. Footgun = nicht-triviale Namens-/userData-Abweichung.
- **Fix** (`apps/windows/src/main/main.ts`, Modul-Kopf VOR `requestSingleInstanceLock`): `setName('munkel')` → `fs.mkdirSync(pinnedUserData,{recursive:true})` → `setPath('userData', %APPDATA%\munkel)` → `setAppUserModelId('app.munkel.windows')`; plus `second-instance`-Handler (null/destroyed-safe, `createMenuWindow`-Recreate, `showMenuWindow` restore/show/focus, KEIN alwaysOnTop-Toggle). `menu-window.ts`: neuer Helper `showMenuWindow()`. `relay-client.ts`: Close-/Reconnect-Logs um `groupId` + Close-Code angereichert.
- **Orchestriert:** Plan → Codex-Plan-Review (fand `pack:dir`-Blocker + `setPath`-Throw-Risiko + alwaysOnTop-Regression) → Codex-Umsetzung → Sonnet-Review „SHIP".
- **Empirisch getestet (bestanden):** zweite Instanz → sofortiger Self-Exit (EXITCODE 0, keine Relay-Verbindung), weiterhin genau 1 Instanz (6 electron.exe), **kein** wm-Flapping. User bestätigt „wm funktioniert wieder".
- **Verifikation:** `bun run typecheck` clean, `bun test` 142 pass / 2 skip / 0 fail.
- **Merge/Tag/Branch:** PR #23 → Merge-Commit `50998af` in `v2-clean`; annotated Tag `fix/windows-single-instance-selfheal` auf den Merge-Commit (gepusht); Branch `platform/windows/single-instance-selfheal` **remote + lokal gelöscht**.

### 2. Alter installierter Build entfernt
- `%LOCALAPPDATA%\Programs\@munkelwindows\Munkel.exe` (Build 28.06.) hatte einen **echten NSIS-Uninstaller + Registry-Eintrag „Munkel 0.0.1"** — Provenienz unklar (keine NSIS-Config im Repo, nur `zip`/`dir`). **Vor** dem Deinstallieren `state.json` gesichert (`scratchpad/munkel-store-backup/state.json.bak`). Offizieller Uninstaller silent gelaufen → Ordner/Exe/Start-Menü-Shortcut/Registry weg; **Store `%APPDATA%\munkel` (wm+espresso) blieb intakt** (verifiziert).

### 3. Dev-Launcher + Windows-Start-Menü-Verknüpfung
- `apps/windows/scripts/launch-munkel-dev.cmd` (committet in PR #23, `f89ddf8`): portabler Launcher, startet `bun run dev` (mit `where bun`-Fallback auf `%USERPROFILE%\.bun\bin\bun.exe`).
- Start-Menü-Verknüpfung `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Munkel.lnk` → Launcher, Icon `assets/icon.ico`, minimierte Konsole. „Munkel" ist über die Windows-Suche startbar → immer der **aktuelle Dev-Stand** (kein Paket-Build). End-to-end getestet (App bootet über den Launcher).

### 4. Notch Peek/History (PR #22) — implementiert, aber QA offen
- Feature umgesetzt (5s FULL → 30s PEEK+weißer Reverse-Ring → RETRACTED → Hover-Reopen → 60s-History-Liste), Codex-Umsetzung + Sonnet „SHIP", PR #22 offen gegen `v2-clean`, Branch `platform/windows/notch-peek-history` (zuletzt `0a3f942`). **QA unvollständig** — volle Animation noch nicht live gesehen; User meldet: Auto-Ausblend-/Einfahr-Sequenz greift noch nicht („Nachrichten verschwinden nicht").

### 5. Memory + IDEAS
- Memory `munkel-dev-is-release` angelegt (Dev = einzige Version, Release = Dev 1:1, keine Prod/Installer-Linie).
- IDEAS.md ergänzt (uncommitted): Menüfenster-Klick-außerhalb-Bug, Notch-Retract-Sequenz-Bug, wm-Root-Cause, installierte-Circles. Stash-Pop-Konflikt beim Branch-Aufräumen sauber aufgelöst (nichts verloren).

## remaining (in Reihenfolge)

1. **Menüfenster schließt nicht per Klick-außerhalb** (neuer Bug, `apps/windows/src/main/menu-window.ts`): großes Menüfenster bleibt dauerhaft offen; Soll = `blur`/Fokusverlust → hide (click-away-to-dismiss). Wahrscheinlich fehlender `blur`→hide-Handler am `alwaysOnTop:true`-Fenster.
2. **Notch „Nachrichten verschwinden nicht"** (`NotchWidget.tsx` + `notch-window.ts`): Auto-Ausblend-/Einfahr-Sequenz greift noch nicht (obwohl laut PR-#22-Plan abgearbeitet). Blockiert die volle Notch-QA.
3. **Notch-QA gesamt** (PR #22): volle Animation live mit einer echten Nachricht (CLI `munkel send <code> <text>` oder Peer) verifizieren; Hover-Reopen unter `setIgnoreMouseEvents(forward:true)` auf Windows prüfen (sonst `notch-reopen`-Cursor-Polling-Fallback). Danach **PR #22 mergen** (Merge-Commit + Tag + Branch schließen, wie bei #23).
4. Optional: fehlenden „munkel"-Circle (lag nur im alten `%APPDATA%\Electron`-Store auf totem `ws://127.0.0.1:8787`) auf Prod-Relay neu joinen, ODER `Electron`-Store bewusst löschen.
5. Entscheiden, ob die uncommitteten IDEAS.md-fp-note-Notizen auf `v2-clean` committet werden sollen.

## decisions (verbatim Rationale)

- **„aus den vorhandenen App-Development-Ressourcen beide Instanzen zu einer mergen … wenn ich eine neue Instanz starte, dass diese sich selbst heilt und nicht zwei Instanzen parallel laufen"** → eine App-Identität, robuster Lock + Self-Heal-Fokus-Handler; **kein** Dev-Profil-Override.
- **„vorerst nur die Development-Version … für den Release werden wir dann auch einfach 1:1 die Development Version pushen … keine Production Version benötigt"** → Shortcut startet `bun run dev` (immer aktueller Source), NICHT einen Paket-Build; kein NSIS/Installer in diesem Scope. (→ Memory `munkel-dev-is-release`.)
- **Alt-Build entfernen (Variante B, Pro/Contra vom User delegiert):** erst reversibel neutralisieren (Store-Backup) → offizieller Uninstaller; sauberes Testumfeld > Abhängigkeit vom nicht-100%-verstandenen Lock-Verhalten.
- **`setPath('userData')` ist Härtung, nicht der funktionale Bugfix** (den erledigt schon `setName`); explizit gepinnt entkoppelt den Lock vom Namens-Default. Keine Migration (Pfad identisch).
- **Empirische Verifikation Pflicht**, weil der exakte Grund des Lock-Versagens beim Alt-Build nicht 100% bewiesen ist.
- **fp-note-Notizen NICHT committen** (Konvention: nur notieren).
- **Git-Konvention (unverändert):** kein FF, Merge-Commit via PR, annotated Tag, Branch löschen. PRs im **Fork** `rodgi040/munkel` (NICHT Upstream `limehq/munkel` — `gh` löst per Default auf Upstream auf → immer `-R rodgi040/munkel`), base `platform/windows/v2-clean` (Vollname).

## blockers

- Keine harten Blocker. **Abhängigkeit:** PR #22 (Notch) sollte erst gemerged werden, wenn die „Nachrichten verschwinden nicht"-Sequenz gefixt + QA bestanden ist.

## next_action

Mit dem User klären, welcher offene Bug zuerst: **Empfehlung — Menüfenster-Klick-außerhalb-Bug** (`menu-window.ts`, `blur`→hide-Handler; klein & standalone, unabhängig von PR #22). Alternativ die Notch-„Nachrichten verschwinden nicht"-Sequenz (Voraussetzung für PR-#22-Merge).
