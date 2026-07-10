# Handoff — munkel (2026-07-10)

## current_state

- **Aktueller Branch:** `platform/windows/macos-parity-p1` (Tip `77d32c5`).
- **Working directory:** sauber bis auf untracked `fp-notes/` (nie committen).
- **Kontext:** P1 Parity-Fixes (E1/E2/WIN-NOTCH-004) implementiert und reviewt. Kritischer Review der 7 Commits `0ef28b8..HEAD` ergab **keine CRITICAL**, aber **drei MAJOR**-Findings, die vor dem Merge nach `platform/windows/v2-clean` behandelt werden sollten.
- **Test-Stand:** `bun test` in `apps/windows`: **216 pass / 3 skip / 0 fail**; `bun run typecheck` clean.

## completed in dieser Session

### 1. P1.1 Dropdown white-on-white fix — DONE
- **Commit:** `7f673bc`
- **Dateien:** `apps/windows/src/renderer/styles/global.css`, `apps/windows/src/renderer/styles/__tests__/global.css.test.ts`
- **Inhalt:** `.frosted-field option { background-color: #1c1c1e; color: var(--munkel-text) }` gepinnt, CSS-Test prüft Regel + nicht-weißen Hintergrund.

### 2. P1.2 Display-name Enter commit — DONE
- **Commit:** `c593e54`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** `commitNameOnEnter` verhindert Default, ruft `updateName()` und blurrt das Input; `lastSavedNameRef` macht Enter + nachfolgenden Blur idempotent; unveränderter/whitespace-only Name wird nicht gesendet.

### 3. P1.3 Notch compact + dynamic resize — DONE
- **Commit:** `4e4c329`
- **Dateien:** `apps/windows/src/main/notch-window.ts`, `apps/windows/src/main/main.ts`, `apps/windows/src/renderer/components/NotchWidget.tsx`, `apps/windows/src/renderer/styles/global.css`, `apps/windows/src/main/preload.ts`, `apps/windows/src/shared/ipc-channels.ts`, `apps/windows/src/shared/types.ts`
- **Inhalt:** Breite 360→280 px, `min-height:100%` entfernt, `ResizeObserver` in `NotchWidget` reported `offsetHeight` via `notch-resize` IPC, Main resizes Fenster clamped [40, 480], Sender-Guard auf `notchWindow`.

### 4. P1.4 Doc-Sync — DONE
- **Commit:** `135457e`
- **Dateien:** `apps/windows/docs/plans/12-macos-feature-parity.md`, `apps/windows/docs/plans/README.md`, `docs/bugs/windows-notch-ux-2026-06-30.md`
- **Inhalt:** Plan 12 P1 als done markiert, Bug-Doc korrigiert (WIN-NOTCH-001 "fixed 2026-07-04" war falsch, tatsächlicher Fix 2026-07-10).

### 5. Test-Härtung — DONE
- **Commit:** `77d32c5`
- **Dateien:** `apps/windows/src/main/__tests__/notch-window.test.ts`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`, `apps/windows/src/renderer/components/__tests__/NotchWidget.test.tsx`, `apps/windows/docs/plans/12-macos-feature-parity.md`
- **Inhalt:** Clamp-Boundary-Tests, NaN/negative-Input-Tests, ResizeObserver-Wiring-Tests, Enter/Blur/Whitespace-Tests, dokumentierter `it.skip`-Regressionstest für den updateName-Retry-Bug.

## remaining (Review-Findings)

| Schwere | Datei:Zeile | Problem | Failure-Szenario |
|---|---|---|---|
| **MAJOR** | `apps/windows/src/renderer/styles/global.css:354-357` | `.frosted-field option`-Styling funktioniert auf Windows-Chromium nicht zuverlässig; native `<select>`-Popups verwenden oft System-Theme/High-Contrast und ignorieren `option`-CSS. | Dropdown bleibt weiterhin weißer Text auf weißem/hellgrauem Hintergrund, besonders bei aktiviertem Windows-Accent-Color-on-surfaces oder High-Contrast-Mode. |
| **MAJOR** | `apps/windows/src/renderer/components/MenuWindow.tsx:83-88` | `updateName()` setzt `lastSavedNameRef.current = name` **vor** `updateProfile(name)` settle; bei rejected Promise ist der Ref bereits auf den fehlgeschlagenen Wert. | Ein Netzwerk-/Main-Process-Fehler beim Speichern des Namens blockiert jeden Retry mit demselben Text permanent; der User muss einen anderen Namen eingeben oder die App neu starten. |
| **MAJOR** | `apps/windows/src/renderer/components/NotchWidget.tsx:26-34` + `apps/windows/src/main/notch-window.ts:36-47` | `ResizeObserver` reported bei jeder Größenänderung sofort via IPC; kein Debounce/Throttle. Bei Display-Skalierung/DPI-Rounding kann `setSize` eine Höhe setzen, die den Observer erneut triggert. | CPU/IPC-Spam während Notch-Animationen; theoretische Endlos-Resize-Schleife oder sichtbares Flackern bei 125 %/150 % Skalierung. |
| **MINOR** | `apps/windows/src/renderer/components/NotchWidget.tsx:62` | `const expanded = reopening || replyOpen;` wird nie verwendet. | Toter Code; verwirrt beim Lesen des Phasen- / Interaktions-Modells. |
| **MINOR** | `apps/windows/src/renderer/styles/global.css:953-970` | 8 Bild-Thumbnails à 72 px + Gap passen nicht mehr komfortabel in 280 px Breite (früher 360 px). | Bei Bilderalben mit vielen Thumbnails wird die Reihe mehrzeilig oder überlappt/scrollt horizontal; visuelle Regression gegenüber vorherigem Layout. |
| **INFO** | `apps/windows/docs/plans/12-macos-feature-parity.md:5` | Plan nennt Branch `platform/windows/macos-feature-parity`, tatsächlicher Branch ist `platform/windows/macos-parity-p1`. | Verwirrt beim Navigieren/Auffinden des Feature-Branches; kein Code-Impact. |

## blockers

- **Keine harten Blocker**, aber der **MAJOR**-Finding zum optimistischen `lastSavedNameRef` sollte vor dem Merge behoben werden, weil er echte Persistenz-Fehler verschleiern kann.
- **Offenes manuelles QA** ist noch nicht durchgeführt: Notch bei 100/125/150 % Display-Skalierung, Dropdown-Farben, Enter-Name-Commit.

## next_action

1. `MenuWindow.tsx` fixen: `lastSavedNameRef.current` erst in `.then()` von `updateProfile(name)` setzen (bzw. bei Fehler in `.catch()` revertieren), damit Retry nach Fehler funktioniert.
2. `notch-resize` mit Debounce/Throttle (z. B. 50–100 ms) und ggf. Rundungs-Toleranz versehen, um Oszillationen zu unterbinden.
3. Dropdown-Lösung evaluieren: custom-Dropdown oder zusätzliche Windows-spezifische Workarounds, falls manuelles QA zeigt, dass `<option>`-Styling nicht greift.
4. Manuelles QA durchführen und Ergebnisse in Plan 12 / STATE.md eintragen.
5. PR `platform/windows/macos-parity-p1` → `platform/windows/v2-clean` öffnen; erst nach Review + grünem CI mergen.

---

# Handoff — munkel (2026-07-05)

[Previous handoff content preserved below]

## current_state

- **Aktueller Branch:** `platform/windows/v2-clean` (Tip: `2ea72ec`).
- **Working directory:** Das ursprüngliche Verzeichnis `C:/Users/rodgi/OneDrive/Documents/CODING/Test/munkel` ist leer/gesperrt (OneDrive- oder Prozess-Lock nach `bun run pack:installer` im Auto-Update-Task). Die aktuelle Arbeitskopie befindet sich in `C:/Users/rodgi/OneDrive/Documents/CODING/Test/munkel-recovery`.
- **Session pausiert** auf User-Anweisung (`/fp-pause`).

## completed in dieser Session (offene Tasks 1–3 von 5)

### 1. Circle-Leave-Bestätigungsdialog — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/circle-leave-confirmation`
- **PR:** #38 → Merge-Commit `803f0fc` in `platform/windows/v2-clean`
- **Tag:** `feat/windows-circle-leave-confirmation`
- **Inhalt:** Frosted Mini-Popup vor dem Verlassen eines Circles, Cancel/Escape/Backdrop-Dismissal, Fokus-Trap, ARIA-Attribute, 278 Zeilen neue `MenuWindow`-Tests.
- **Doku:** `apps/windows/docs/plans/09-circle-leave-confirmation.md`, `apps/windows/docs/plans/README.md`, `apps/windows/README.md`, `docs/README.md` aktualisiert.
- **Verifikation:** 178 pass / 2 skip / 0 fail; typecheck + build green; CI green.

### 2. Logo-Assets-Pipeline — DONE (placeholder), gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/logo-assets-integration`
- **PR:** #39 → Merge-Commit `7787cc0` in `platform/windows/v2-clean`
- **Tag:** `feat/windows-logo-assets-pipeline`
- **Inhalt:** Kanonische `apps/windows/assets/logo.svg`, `render-ico` + `render-tray-icon` rendern daraus, neue `tray-icon-24.png`, Tray-Resolution-Chain 32→24→16, deterministic, alles committed.
- **Wichtig:** Es existieren weiterhin keine offiziellen Brand-Assets; `logo.svg` ist ein klar kommentierter Placeholder. Status in `docs/README.md` daher "Partially done".
- **Doku:** Plan 10, `apps/windows/README.md`, `docs/README.md`, `apps/windows/docs/plans/README.md` aktualisiert.
- **Verifikation:** typecheck, tests, build, `pack:dir` + ICO-Ressourcen-Check green; CI green.

### 3. Auto-Update (electron-updater) — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/auto-update`
- **PR:** #40 → Merge-Commit `92b06f4` in `platform/windows/v2-clean`
- **Zusätzlicher Fix-Commit auf dem Branch:** `26bb5bb` (Vite-External `electron-updater`, Race-Condition-Guards, Error-Sanitization, Release-Workflow-Independence, mehr Tests)
- **Tag:** `feat/windows-auto-update`
- **Inhalt:** `electron-updater` mit GitHub-Releases-Feed (`rodgi040/munkel`), Auto-Check beim Start + alle 24h, manueller "Check for Updates…"-Trigger, Renderer-Status-Pill, Tray-Menü-Eintrag, IPC-Erweiterung, Unit-Tests für Update-Service + MenuWindow, CI-Smoke-Test `pack:installer`, Windows-Release-Job in `release.yml`.
- **Sicherheit:** `verifyUpdateCodeSignature: false` für unsigned Beta mit TODO, Error-Messages gesäubert, keine sensitiven Pfade/UI.
- **Doku:** Plan 11, `apps/windows/docs/ipc-contract.md`, `apps/windows/README.md`, `docs/README.md` aktualisiert.
- **Verifikation:** 195 pass / 2 skip / 0 fail; typecheck + build + `pack:installer` (inkl. `latest.yml`) green; CI green.

## remaining (offene Tasks 4–5)

### 4. NSIS-Installer an `main` übergeben — IN PROGRESS / PAUSIERT
- **Status:** NSIS-Installer mit Start-Menü-Shortcuts ist bereits in `platform/windows/v2-clean` (PR #25). Der finale PR nach `main` ist noch ein Draft.
- **AGENTS.md:** `main` darf nur einmal am Ende via manuell reviewed PR erreicht werden.
- **Nächster Schritt:** Plan-Agent für Handover-Vorbereitung starten, Diff `v2-clean` ↔ `main` analysieren, Draft-PR prüfen/aktualisieren, Handover-Checkliste erstellen. Kein autonomer Merge nach `main`.

### 5. Manuelle QA-Gates dokumentieren — PENDING
- **Circle Presence 2-Personen-Visueller-Check**
- **Menü click-away dismiss**
- **Notch auto-hide/retract**
- **Nächster Schritt:** Strukturierte QA-Testpläne/Checklisten in der Dokumentation anlegen.

## offene Pull Requests

- Keine eigenen Feature-PRs mehr offen (alle gemerged).
- Der PR von `platform/windows/v2-clean` nach `main` ist laut `docs/README.md` ein Draft (menschlicher End-PR).

## tags dieser Session

- `feat/windows-circle-leave-confirmation`
- `feat/windows-logo-assets-pipeline`
- `feat/windows-auto-update`

## branches dieser Session (remote gelöscht)

- `platform/windows/circle-leave-confirmation`
- `platform/windows/logo-assets-integration`
- `platform/windows/auto-update`

## blockers

- **Working-directory-Recovery:** `C:/Users/rodgi/OneDrive/Documents/CODING/Test/munkel` ist leer/gesperrt. Eine Wiederherstellung (Reboot/OneDrive-Resync) oder dauerhafte Nutzung von `munkel-recovery` ist nötig.

## next_action

1. Neues Verzeichnis/Session vorbereiten.
2. Task 4 (NSIS-Handover) mit Plan-Agent starten.
3. Task 5 (QA-Gates-Doku) abschließen.

---

# Handoff — munkel (2026-07-03)

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
- **Fix** (`apps/windows/src/main/main.ts`, Modul-Kopf VOR `requestSingleInstanceLock`): `setName('munkel')` → `fs.mkdirSync(pinnedUserData,{recursive:true})` → `setPath('userData', %APPDATA%\munkel)` → `setAppUserModelId('app.munkel.windows')`; plus `second-instance`-Handler (null/destroyed-safe, `createMenuWindow`-Recreate, `showMenuWindow` restore/show/focus, KEIN alwaysOnTop-Toggle). `menu-window.ts`: neuer Helper `showMenuWindow()`.
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
