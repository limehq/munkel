# IDEAS

## Inbox (unsorted)

- 2026-06-30 **[task]** Windows notch UX broken: oversized notch on incoming message, no message history, reply typing/send fails — see `docs/bugs/windows-notch-ux-2026-06-30.md`
- 2026-06-30 **[task]** Session 1 (P0): WIN-NOTCH-003 — Reply/Send reparieren — siehe **Work sessions → Session 1** unten
- 2026-06-30 **[task]** Session 2 (P1): WIN-NOTCH-001 — Notch-Größe / Layout — siehe **Work sessions → Session 2** unten
- 2026-06-30 **[task]** Session 3 (P2): WIN-NOTCH-002 — 60s Message History (macOS MVP) — siehe **Work sessions → Session 3** unten
- 2026-07-01 **[task]** Windows: erneuter Start über Windows-Suche öffnet zweite App-Instanz — Single-Instance + Self-Healing nötig (keine Doppelinstanz, sauberer Lauf) — **FIXED + EMPIRISCH VERIFIZIERT 2026-07-03** (PR #23 `50998af`: `requestSingleInstanceLock` + `second-instance`→focus in `main.ts:31-48`). Zweite Instanz → Self-Exit (Exit 0); User-bestätigt. Alt-Build entfernt. Lock keyt auf userData-Pfad (case-insensitiv) → Namensvarianten irrelevant. Siehe Z.23.
- 2026-07-02 **[bug]** Manuelle QA: UI ist zu durchsichtig — muss unbedingt dunkler/opaker sein (Kontrast/Lesbarkeit) — **FIXED 2026-07-03**
- 2026-07-02 **[bug]** Manuelle QA: UI ist nicht scrollbar
- 2026-07-02 **[bug]** Manuelle QA: Widget oben am Bildrand/Notch (eingeblendet) ist nicht funktional
- 2026-07-02 **[task]** "Test notch"-Funktion ist noch in der UI — nach Testing entfernen
- 2026-07-02 **[task]** Logo-Dateien sind noch nicht in die App eingearbeitet
- 2026-07-02 **[task]** Auto-Update-Funktion muss noch geplant und erstellt werden
- 2026-07-02 **[task]** Installations-Script erstellen und an Haupt-Projekt-Administrator übergeben
- 2026-07-02 **[bug]** Circle-Presence: Ich werde bei meinem Kollegen nicht online angezeigt (Online-Status/Presence wird nicht korrekt propagiert) — beim manuellen QA von Session 1 aufgefallen — **FIXED 2026-07-02** (userData/Relay-Fix, verifiziert)
- 2026-07-02 **[task]** Notch-Reply-Trigger: Klick direkt auf die Nachricht (mittig in der Notch, nach Hover) soll — ZUSÄTZLICH zum ↩-Button — direkt das Reply-Textfeld in der Notch öffnen. Beide Wege sollen möglich sein (Klick auf Nachricht ODER ↩-Icon). Weicht bewusst von Plan-01-Entscheidung „nur ↩ öffnet Reply" ab. — **IMPLEMENTED 2026-07-02** (Klick auf `.message-body` öffnet Reply; Thumbnails/Copy/Avatar ausgenommen; Drag-Select-Guard; Helper `should-open-reply-on-message-click.ts` + 6 Tests; typecheck+tests grün 142 pass; manuelle QA offen)
- 2026-07-03 **[idea]** Circle verlassen: vor dem Austritt aus einem Circle ein Mini-Popup/Bestätigungsdialog anzeigen — User muss erst bestätigen, dass er den Circle wirklich verlassen möchte (versehentliches Austreten verhindern)
- 2026-07-03 **[task]** Notch Peek/History-Feature (PR #22, Branch `platform/windows/notch-peek-history`): **MERGED 2026-07-04** (`a72b456`) into `platform/windows/v2-clean`. Implements 5s FULL → 30s PEEK with white reverse ring → RETRACTED → hover-reopen → 60s in-memory history list. Code review + automated tests green; full live animation QA deferred to Plan 07 re-QA gate. Highest residual risk remains whether hover-reopen is reliable in the click-through state (`setIgnoreMouseEvents(forward:true)`) on Windows — Plan 07 will activate the `notch-reopen` cursor-polling fallback only if reproved.
- 2026-07-03 **[bug]** Installierte Munkel zeigt nicht alle Circles: verwaister Legacy-Store `%APPDATA%\Electron` (Circle „munkel" auf totem `ws://127.0.0.1:8787`) wurde bei der 2026-07-02 Store/Relay-Migration (siehe „Circle-Presence" Z.17) **nicht mit-migriert**. Aktueller Store `%APPDATA%\munkel` (= `Munkel`, case-insensitiv derselbe Ordner — nanosekunden-identische mtime bewiesen) hat nur **wm + espresso** auf Prod-Relay. Dev- UND installierte Version (`%LOCALAPPDATA%\Programs\@munkelwindows\Munkel.exe`, productName „Munkel") teilen sich diesen Store — kein Dev-vs-Paket-Split. Offen: (a) fehlenden „munkel"-Circle auf Prod-Relay neu joinen ODER `Electron`-Store bewusst löschen; (b) Single-Instance-Lock (`main.ts:26`) greift evtl. nicht über Namensvarianten „munkel"/„Munkel" → Dev+installiert gleichzeitig = konkurrierende Schreiber auf 1 `state.json`. **UPDATE 2026-07-04:** (b) **GELÖST** — Lock keyt auf userData-Pfad (case-insensitiv), Namensvarianten irrelevant; empirisch verifiziert + Alt-Build entfernt (siehe Z.23). (a) **ERLEDIGT 2026-07-04** — verwaister `%APPDATA%\Electron`-Store gesichert (`scratchpad/electron-store-backup-20260704/`) + gelöscht + verifiziert (siehe [Plan 08](apps/windows/docs/plans/08-electron-store-cleanup.md)). Toter Legacy-Store (beide Circles auf totem localhost-Relay), app nutzt ohnehin `%APPDATA%\munkel`. **Cluster damit vollständig abgeschlossen.**
- 2026-07-03 **[bug]** Nachrichten verschwinden nicht, nachdem sie angekommen sind — die geplante Notch-Auto-Ausblend-/Einfahr-Sequenz ist **mittlerweile gemergt** (PR #22 `a72b456`) und der Hover-stuck-Deadlock in Plan 07 behoben. Soll: eingeblendet → retract → Sliver → nach 60 s ganz weg. — **IMPLEMENTED 2026-07-04** ([Plan 07](apps/windows/docs/plans/07-notch-retract-verify-fix.md)): `useNotchLifecycle` extrahiert, `!hovering`-Guard aus Empty-Hide entfernt, Tests grün (`platform/windows/notch-retract-fix`, 159 pass / 2 skip / 0 fail). Der ursprüngliche Bug wurde **vor** dem PR-#22-Merge (2026-07-04 11:28, `a72b456`) gemeldet — Retract-Feature war damals noch nicht im Build; gemergter Code war **korrekt verdrahtet**. Manuelle Windows-QA noch offen.
- 2026-07-03 **[bug]** Circle „wm" verschwindet zur Laufzeit — **Root-Cause BELEGT** (Codex-Analyse gpt-5.5, Report `scratchpad/wm-circle-drop-analysis.md`): **Zwei-Instanzen-Verdrängung.** Installierter `app.asar` (Build 28.06.) enthält **kein** `app.setName('munkel')` (aktueller Source `main.ts:20-26` schon) → Dev-Mutex „munkel" ≠ Paket-Mutex „Munkel" → Single-Instance-Lock wirkungslos, beide Apps liefen parallel. Beide teilen Store + `memberId 602a0e2c…`; `core/protocol.ts:14-18`: neue Verbindung gleicher memberId **ersetzt alte still** → gegenseitige Verdrängung aus wm-Relay-Gruppe → Relay-Flapping (`close-1006→reconnect→open`, `relay-client.ts:138-160`). **Entwarnung:** wm wird NICHT aus State gelöscht (`group-session.ts:240-243` setzt nur `isConnected=false`; Circle bleibt im Menü, nur „offline"/Senden schlägt fehl). Noch Hypothese: ob Server aktiv 1006 bei gleicher group+member schickt (braucht Server-Log/2-Instanzen-Repro). **STATUS 2026-07-04 — FIXED + EMPIRISCH VERIFIZIERT** (Quelle HANDOFF.md 2026-07-03 + fs-Check 2026-07-04): `main.ts:25-48` (PR #23 `50998af`): `app.setName('munkel')` vor userData, pinned Store, `AppUserModelId`, `requestSingleInstanceLock` + `second-instance`→focus. Empirisch: zweite Instanz → sofortiger Self-Exit (Exit 0, keine Relay-Verbindung), kein wm-Flapping; **User bestätigt „wm funktioniert wieder"**; typecheck clean, 142 tests pass. Alter 28.06-Build **deinstalliert** (fs-verifiziert: `%LOCALAPPDATA%\Programs\@munkelwindows\` existiert nicht mehr). **Zu Kimis 'PARTIALLY-SOLVED' (ohne HANDOFF-Kontext erstellt):** Restrisiken beruhten auf der Annahme, der Lock keye auf den App-*Namen* (Munkel≠munkel=2 Mutexe); Projekt-Recherche (HANDOFF Z.16) belegt: Lock keyt auf den **userData-Pfad** (case-insensitiv) → `munkel`==`Munkel`=derselbe Lock → moot; Empfehlung 'Dev/Prod-Split' widerspricht der bewussten User-Entscheidung 'kein Dev-Profil-Override'. **Optionale Defense-in-Depth (KEIN Bug):** `core/protocol.ts` silent-replace-Backoff + `identity-store.ts` memberId-Regen-Guard. **FAZIT: Cluster gelöst.** Einziger echter Rest: verwaister `%APPDATA%\Electron`-Store (siehe Z.21).
- 2026-07-03 **[bug]** Großes Munkel-Menüfenster lässt sich nicht per Klick woanders schließen — es bleibt dauerhaft offen. Soll: Klick außerhalb / Fokusverlust (blur) soll es schließen/ausblenden (click-away-to-dismiss). Vermutlich fehlt ein `blur`→hide-Handler; das `alwaysOnTop:true`-Menüfenster (`menu-window.ts`) reagiert nicht auf Fokusverlust. Muss korrigiert werden. — **PLAN 06 FERTIG 2026-07-04** ([`apps/windows/docs/plans/06-menu-window-dismiss.md`](apps/windows/docs/plans/06-menu-window-dismiss.md)): blur→hide mit Suppress-Gate (Picker/GitHub-Login/DevTools) + Tray-Toggle-Race-Guard + isDestroyed-Safety + reine Testfunktionen. Kimi-geplant, 2× Kimi-kritik-verifiziert, 2 Entscheidungen (Picker=Suppress-Signal, Login=Suppress) bestätigt. — **MERGED 2026-07-04** (Branch `platform/windows/menu-dismiss-on-blur` → `platform/windows/v2-clean`): 8 Dateien (`menu-dismiss.ts` + Tests, `menu-window.ts` blur/guard, `main.ts`/`preload.ts`/`types.ts` wiring, `MenuWindow.tsx` select-signal, ipc-contract). typecheck PASS, 160 tests pass/0 fail. Manuelle QA offen.

---

## Work sessions — Windows Notch UX (sequenziell)

**Branch-Basis:** `platform/windows/v2-clean`  
**Feature-Branch (empfohlen):** `platform/windows/notch-ux-fixes` (Session 1 anlegen; Session 2+3 darauf stacken oder gleicher Branch)  
**Vollständiger Analyse-Report:** [`docs/bugs/windows-notch-ux-2026-06-30.md`](docs/bugs/windows-notch-ux-2026-06-30.md)  
**Reihenfolge:** Session 1 → 2 → 3 (nicht parallel — jede Session baut auf der vorherigen QA auf)

### Session 0 — Repro bestätigen (optional, ~30 Min vor Session 1)

Manuell mit User, kein Code:

- [ ] Echten Circle joinen (nicht „Test notch“ / `group: demo`)
- [ ] Nachricht von Peer oder CLI empfangen
- [ ] **↩ Reply-Button** klicken (nicht Nachrichtentext — Plan 01)
- [ ] DevTools Notch-Fenster: `state.circles` leer?
- [ ] Broadcast (🌐) vs. Direct (🔒) getrennt testen
- [ ] Display-Skalierung notieren (100 % / 125 % / 150 %)

---

### Session 1 — P0: WIN-NOTCH-003 Reply & Send (~2 h)

**Ziel:** Antworten aus der Notch funktioniert zuverlässig bei echten Nachrichten.

**Symptom:** Kein Tippen / Send liefert nicht.

**Root causes (aus Analyse, Konfidenz HIGH):**

| # | Ursache | Typ |
|---|---------|-----|
| RC-3a | Klick auf Nachricht öffnet kein Reply — nur ↩ (Plan 01) | UX (kein Code-Bug) |
| RC-3b | `broadcastState()` sendet **nicht** an `notchWindow` → leere/stale `circles` | **Confirmed bug** |
| RC-3c | `NotchMessage` ohne `senderMemberId` — nur Display-Name | **Design gap** |
| RC-3d | DM-Fallback: Display-Name als `to` → `{ ok: true }` obwohl Zustellung scheitert (kein Relay-Ack) | **Confirmed bug** |
| RC-3e | Focus nach 1× rAF (macOS: 80 ms); StrictMode-Race in Dev | Wahrscheinlich |
| RC-3f | Test-Notch `group: demo` ohne Session | QA trap |

**Tasks (in Reihenfolge):**

1. [x] `broadcastState`: `notchWindow?.webContents.send('state-update', update)` — `apps/windows/src/main/main.ts` (via `broadcast-state.ts` Helper)
2. [x] `NotchMessage.senderMemberId` ergänzen — `apps/windows/src/shared/types.ts`
3. [x] Beim Empfang `frame.from` als `senderMemberId` setzen — `apps/windows/src/main/group-session.ts` (~312, ~359)
4. [x] `NotchWidget.sendReply`: `to = message.senderMemberId` bei DM; fail-closed wenn fehlt — `NotchWidget.tsx` (via `resolveReplyRecipient`)
5. [x] Focus-Delay 80 ms nach `beginNotchReply` (macOS-Parität) — `NotchWidget.tsx` (setTimeout 80ms + Timer-Cleanup gegen StrictMode-Race)
6. [x] Test-Notch: hide-Timeout 5s → 30s für QA — `main.ts` `runNotchDemo()` (QA-Falle `group: demo` ohne Session bleibt bekannt)
7. [x] `ipc-contract.md` + `ui-spec.md`: `senderMemberId`, fail-closed statt Display-Name-Fallback
8. [x] `group-session.test.ts`: `onNotch`-Assertions um `senderMemberId` erweitert
9. [x] Pure function + Test: `apps/windows/src/renderer/lib/resolve-reply-recipient.ts` + `__tests__/resolve-reply-recipient.test.ts`
10. [x] Test: `broadcastState` erreicht notchWindow — `apps/windows/src/main/__tests__/broadcast-state.test.ts`
11. [x] `lookupMemberId` entfernt (durch `resolveReplyRecipient` ersetzt)

**Code-Stand (2026-07-02):** Alle Code-Tasks erledigt; typecheck + `bun test` grün (134 pass / 2 skip / 0 fail). Offen: **manuelle QA** (Acceptance unten) + Commit.

**Dateien:** `main.ts`, `types.ts`, `group-session.ts`, `NotchWidget.tsx`, `resolve-reply-recipient.ts`, `ipc-contract.md`, `ui-spec.md`, Tests

**Acceptance:**

- [ ] Nach Join: Notch-Store hat aktuelle `circles`
- [ ] DM-Reply (🔒): Send liefert an Peer; `to` ist memberId-UUID
- [ ] Broadcast-Reply (🌐): Send ohne `to`
- [ ] Fehlender Recipient → rote Inline-Meldung, Feld bleibt offen
- [ ] ↩ → Input fokussiert, Tastatur funktioniert
- [ ] `bun run typecheck --filter=@munkel/windows` + Tests grün

**Out of scope Session 1:** Relay-Ack-Warten (größerer Scope), Teaser-Modus, History, Fenstergröße

---

### Session 2 — P1: WIN-NOTCH-001 Notch-Größe (~2–3 h)

**Ziel:** Notch wirkt proportional (nicht „viel zu groß“), Spec „height adapts to content“ erfüllt.

**Symptom:** Notch oben am Bildschirm viel zu groß.

**Root causes (Konfidenz HIGH):**

| # | Ursache |
|---|---------|
| RC-1 | Kein Teaser — sofort Expanded (Phase 1 by design); macOS startet ~58 px Teaser |
| RC-2 | Festes BrowserWindow 360×260 — toter transparenter Bereich |
| RC-3 | Breite 360 vs. 310 px Landing; Avatar 40 vs. 34 px |
| RC-4 | CSS `::before` blur-Shadow ohne clip |
| RC-5 | `thickFrame` + `hasShadow` auf frameless window |

**Tasks (in Reihenfolge):**

1. [ ] Quick parity: `NOTCH_WIDTH` 310, Avatar 34, initiale Höhe ~140–180 — `notch-window.ts`, `NotchWidget.tsx`, `global.css`
2. [ ] `notch-window.ts`: `resizable: true` (aktuell `false`); `setBounds`/`setSize` + X-Rezentrierung bei Breitenänderung
3. [ ] IPC `notch-resize { width, height }` — `types.ts` (`IpcApi`), `preload.ts`, `main.ts`, `notch-window.ts`, `ipc-contract.md`
4. [ ] `ResizeObserver` in `NotchWidget` misst `.notch-widget` → IPC resize; Min/Max-Höhe + optional Debounce
5. [ ] `::before` Shadow reduzieren; optional `thickFrame: false` nur Notch testen
6. [ ] `ui-spec.md`: Größe + dynamische Höhe dokumentieren (Spec sagt bereits „height adapts“ — Implementation angleichen)
7. [ ] Manuell: Test notch + echte Nachricht; 100 % / 125 % Scaling

**Dateien:** `notch-window.ts`, `NotchWidget.tsx`, `global.css`, `types.ts`, `preload.ts`, `main.ts`, `ipc-contract.md`, `ui-spec.md`

**Acceptance:**

- [ ] Sichtbare Pill ≈ Inhaltshöhe (kein großer leerer Streifen unten)
- [ ] Breite ~310 px, Avatar 34 px
- [ ] Reply-Feld + Bild-Thumbs: Fenster wächst mit
- [ ] typecheck + tests grün

**Out of scope Session 2:** Teaser→Expand-Morph (macOS Phase 2), History-UI

**Abhängigkeit:** Session 1 QA bestanden (Reply muss für Größen-Test mit Inhalt funktionieren)

---

### Session 3 — P2: WIN-NOTCH-002 Message History (~3–4 h) — **MERGED via PR #22**

**Ziel:** 60-Sekunden-Nachrichtenverlauf unterhalb der aktuellen Nachricht (macOS MVP).

**Symptom:** Verlauf der Nachrichten wird nicht angezeigt.

**Root cause:** Fehlendes Feature — `NotchWidget` nur 1 Message; `notchMessages[]` ungenutzt; kein Main-Buffer wie macOS `NotchPresenter`.

**Tasks (in Reihenfolge):**

1. [x] `NotchHistoryEntry` mit `id`, `receivedAt`, Display-Feldern — `types.ts`
2. [x] Hook `useNotchHistory`: bei `notch-message` current→history archivieren; 60 s prune (Interval) — neu `hooks/useNotchHistory.ts`
3. [x] History-Rows in `NotchWidget` unter current message
4. [x] CSS portieren von Landing `.nx-history` / `.nx-row` — `global.css`
5. [x] Bild-Nachrichten: 📷-Summary in History (macOS-Format)
6. [x] Dead code konsolidieren: `notchMessages` / doppelte `onNotchMessage`-Listener bereinigen — `app-store.tsx`, `NotchWidget.tsx`
7. [x] `ui-spec.md` + `ipc-contract.md`: 60 s RAM-only history
8. [x] Pure-Function-/Hook-Test für 60s-Prune + Archivierung (kein Renderer-Component-Test — keine `.test.tsx`-Infra im Projekt); z. B. Logik in testbare Funktion auslagern + Bun-Test
9. [x] `group-session.test.ts` / `scripts/interop.ts`: `NotchMessage`-Payloads ggf. anpassen

**Dateien:** `types.ts`, `useNotchHistory.ts`, `NotchWidget.tsx`, `global.css`, `app-store.tsx`, docs

**Acceptance:**

- [x] 3 Nachrichten in 60 s → 2 History-Rows + 1 current
- [x] >60 s alte Rows verschwinden (live prune)
- [x] Neue Nachricht: vorherige current → history
- [x] History-Row-Klick kopiert Text
- [x] Reply-Compose weiterhin OK (Session-1-Regression)
- [x] Fensterhöhe passt (Session-2-ResizeObserver)
- [x] typecheck + tests grün

**Out of scope Session 3:** Expand/collapse history, hover-copy glyph, Main-Process-Buffer (Proposal C)

**Abhängigkeit:** Session 1 + 2 abgeschlossen (Session 2 Resize **zwingend** vor History — sonst leerer Streifen / Clipping)

---

### Verifikation (2026-06-30)

Sub-Agent-Review: **PASS WITH CONCERNS** — Hauptursachen im Plan korrekt; Korrekturen oben eingearbeitet (ipc-contract, resizable, Test-Strategie, RC-3d Präzisierung). Branch `platform/windows/notch-ux-fixes` konform mit AGENTS.md.

---

### Nach allen Sessions

- [ ] Manuell: HITL-Checkliste Session 0 erneut
- [ ] PR → `platform/windows/v2-clean`
- [ ] Bug-Doc Status → Fixed in `docs/bugs/windows-notch-ux-2026-06-30.md`

---

## Classified

| Topic | Type | Status | Target | Note | Date |
|-------|------|--------|--------|------|------|
| Windows notch UX | bug | idea | `docs/bugs/windows-notch-ux-2026-06-30.md` | Umbrella WIN-NOTCH-001/002/003 | 2026-06-30 |
| Session 1 — Notch Reply/Send (P0) | task | open | IDEAS.md § Session 1 | WIN-NOTCH-003: broadcastState, senderMemberId, focus 80ms | 2026-06-30 |
| Session 2 — Notch sizing (P1) | task | open | IDEAS.md § Session 2 | WIN-NOTCH-001: 310px, dynamic resize, shadow | 2026-06-30 |
| Session 3 — Notch history (P2) | task | **merged (PR #22)** | IDEAS.md § Session 3 | WIN-NOTCH-002: 60s useNotchHistory MVP | 2026-06-30 |
| Windows duplicate instance on relaunch | bug | **FIXED + verifiziert** | `apps/windows/src/main/main.ts:31-48` | PR #23: Lock+`second-instance`→focus. Empirisch getestet (2. Instanz Self-Exit, Exit 0) + User-bestätigt. Details Z.23 | 2026-07-01 |
| UI zu durchsichtig | bug | idea | `apps/windows/src/renderer/styles/global.css` | Opazität/Background dunkler; Kontrast + Lesbarkeit | 2026-07-02 |
| UI nicht scrollbar | bug | idea | `apps/windows/src/renderer` | overflow/scroll-Container fehlt | 2026-07-02 |
| Notch-Widget nicht funktional | bug | idea | `apps/windows/src/renderer/components/NotchWidget.tsx` | Eingeblendetes Notch-Widget reagiert nicht — evtl. WIN-NOTCH-003-Folge, QA reproduzieren | 2026-07-02 |
| "Test notch" aus UI entfernen | task | idea | `apps/windows/src/main/main.ts` (`runNotchDemo`) + Tray-Menü | Nur QA-Feature; vor Release entfernen | 2026-07-02 |
| Logo-Assets einarbeiten | task | idea | `apps/windows` (Icons/Tray/Installer) | App-Icon, Tray-Icon, Fenster-Icon, Installer-Branding | 2026-07-02 |
| Auto-Update planen + bauen | task | idea | `apps/windows` (electron-updater?) | Update-Mechanismus + Release-Feed; erst Architektur festlegen | 2026-07-02 |
| Installations-Script + Handover | task | idea | `apps/windows` (Packaging) | Installer-Script erstellen, an Haupt-Projekt-Admin übergeben | 2026-07-02 |
| Notch-Auto-Ausblend/Einfahr-Sequenz fehlt | bug | **implemented/merged (Plan 07)** | [`docs/plans/07-notch-retract-verify-fix.md`](apps/windows/docs/plans/07-notch-retract-verify-fix.md) | PR #22 `a72b456` merged; Plan 07 fix extrahiert `useNotchLifecycle`, entfernt `!hovering`-Guard, 159 pass/2 skip/0 fail. Ursprünglicher Bug vor PR-#22-Merge gemeldet → wahrscheinlich stale. Manuelle QA offen | 2026-07-03 |
| Menüfenster schließt nicht per Klick-außerhalb | bug | **merged (this merge)** | [`docs/plans/06-menu-window-dismiss.md`](apps/windows/docs/plans/06-menu-window-dismiss.md) | blur→hide + Suppress-Gate + Tray-Race-Guard. 8 Dateien, typecheck+160 tests grün. Branch `menu-dismiss-on-blur` merged into `v2-clean`. Manuelle QA offen | 2026-07-03 |
| Two-instance cluster (wm verschwindet) | bug | **FIXED + verifiziert** | `apps/windows/src/main/main.ts:25-48` | PR #23; empirisch (2. Instanz Self-Exit) + User-bestätigt; Alt-Build entfernt; Lock keyt auf userData-Pfad. Kimis PARTIAL-Verdict durch HANDOFF + fs-Check widerlegt. Details Z.23 | 2026-07-04 |
| Verwaisten `%APPDATA%\Electron`-Store bereinigen | task | **DONE** | [`docs/plans/08-electron-store-cleanup.md`](apps/windows/docs/plans/08-electron-store-cleanup.md) | Gesichert (`scratchpad/electron-store-backup-20260704/`) + gelöscht + verifiziert weg. Toter Legacy-Store (localhost-Relay). | 2026-07-04 |
| Optionale Cluster-Härtung (non-blocking) | task | **optional/backlog** | `core/protocol.ts` / `identity-store.ts` | Defense-in-Depth, KEIN offener Bug: protocol.ts silent-replace-Backoff + identity-regen-Guard. Dev/Prod-Split bewusst NICHT (User-Entscheidung). | 2026-07-04 |
| Circle-Presence: nicht online angezeigt | bug | **fixed (code) — 2-Client-Confirm offen** | `main.ts` / `session-store.ts` / `identity-store.ts` / `relay-client.ts` | **Behoben 2026-07-02, end-to-end verifiziert** (`[relay] open` + TCP `172.67.222.90:443 Established` zum Prod-Relay; vorher 0 Verbindungen). Ursache NICHT Presence-Logik, sondern (H-D) Dev nutzte userData-Default `%APPDATA%\Electron` + (H-A) Circles auf totem `ws://127.0.0.1:8787`. Fixes: `app.setName('munkel')` (kanonischer Store), Relay-Default→prod via `MUNKEL_RELAY_URL`-Override, Repair persistierter localhost-URLs, H-C RelayClient-Reconnect-Härtung (error-ohne-close) + Tests, Phase-0-Diagnostik-Logging. Guten State nach `%APPDATA%\munkel` migriert (Pablo+Avatar+espresso@prod). typecheck+tests grün (136 pass). **Offen:** finaler 2-Personen-Sichttest mit Kollege. | 2026-07-02 |
