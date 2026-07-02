# IDEAS

## Inbox (unsorted)

- 2026-06-30 **[task]** Windows notch UX broken: oversized notch on incoming message, no message history, reply typing/send fails — see `docs/bugs/windows-notch-ux-2026-06-30.md`
- 2026-06-30 **[task]** Session 1 (P0): WIN-NOTCH-003 — Reply/Send reparieren — siehe **Work sessions → Session 1** unten
- 2026-06-30 **[task]** Session 2 (P1): WIN-NOTCH-001 — Notch-Größe / Layout — siehe **Work sessions → Session 2** unten
- 2026-06-30 **[task]** Session 3 (P2): WIN-NOTCH-002 — 60s Message History (macOS MVP) — siehe **Work sessions → Session 3** unten
- 2026-07-01 **[task]** Windows: erneuter Start über Windows-Suche öffnet zweite App-Instanz — Single-Instance + Self-Healing nötig (keine Doppelinstanz, sauberer Lauf)
- 2026-07-02 **[bug]** Manuelle QA: UI ist zu durchsichtig — muss unbedingt dunkler/opaker sein (Kontrast/Lesbarkeit)
- 2026-07-02 **[bug]** Manuelle QA: UI ist nicht scrollbar
- 2026-07-02 **[bug]** Manuelle QA: Widget oben am Bildrand/Notch (eingeblendet) ist nicht funktional
- 2026-07-02 **[task]** "Test notch"-Funktion ist noch in der UI — nach Testing entfernen
- 2026-07-02 **[task]** Logo-Dateien sind noch nicht in die App eingearbeitet
- 2026-07-02 **[task]** Auto-Update-Funktion muss noch geplant und erstellt werden
- 2026-07-02 **[task]** Installations-Script erstellen und an Haupt-Projekt-Administrator übergeben
- 2026-07-02 **[bug]** Circle-Presence: Ich werde bei meinem Kollegen nicht online angezeigt (Online-Status/Presence wird nicht korrekt propagiert) — beim manuellen QA von Session 1 aufgefallen — **FIXED 2026-07-02** (userData/Relay-Fix, verifiziert)
- 2026-07-02 **[task]** Notch-Reply-Trigger: Klick direkt auf die Nachricht (mittig in der Notch, nach Hover) soll — ZUSÄTZLICH zum ↩-Button — direkt das Reply-Textfeld in der Notch öffnen. Beide Wege sollen möglich sein (Klick auf Nachricht ODER ↩-Icon). Weicht bewusst von Plan-01-Entscheidung „nur ↩ öffnet Reply" ab. — **IMPLEMENTED 2026-07-02** (Klick auf `.message-body` öffnet Reply; Thumbnails/Copy/Avatar ausgenommen; Drag-Select-Guard; Helper `should-open-reply-on-message-click.ts` + 6 Tests; typecheck+tests grün 142 pass; manuelle QA offen)

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

### Session 3 — P2: WIN-NOTCH-002 Message History (~3–4 h)

**Ziel:** 60-Sekunden-Nachrichtenverlauf unterhalb der aktuellen Nachricht (macOS MVP).

**Symptom:** Verlauf der Nachrichten wird nicht angezeigt.

**Root cause:** Fehlendes Feature — `NotchWidget` nur 1 Message; `notchMessages[]` ungenutzt; kein Main-Buffer wie macOS `NotchPresenter`.

**Tasks (in Reihenfolge):**

1. [ ] `NotchHistoryEntry` mit `id`, `receivedAt`, Display-Feldern — `types.ts`
2. [ ] Hook `useNotchHistory`: bei `notch-message` current→history archivieren; 60 s prune (Interval) — neu `hooks/useNotchHistory.ts`
3. [ ] History-Rows in `NotchWidget` unter current message
4. [ ] CSS portieren von Landing `.nx-history` / `.nx-row` — `global.css`
5. [ ] Bild-Nachrichten: 📷-Summary in History (macOS-Format)
6. [ ] Dead code konsolidieren: `notchMessages` / doppelte `onNotchMessage`-Listener bereinigen — `app-store.tsx`, `NotchWidget.tsx`
7. [ ] `ui-spec.md` + `ipc-contract.md`: 60 s RAM-only history
8. [ ] Pure-Function-/Hook-Test für 60s-Prune + Archivierung (kein Renderer-Component-Test — keine `.test.tsx`-Infra im Projekt); z. B. Logik in testbare Funktion auslagern + Bun-Test
9. [ ] `group-session.test.ts` / `scripts/interop.ts`: `NotchMessage`-Payloads ggf. anpassen

**Dateien:** `types.ts`, `useNotchHistory.ts`, `NotchWidget.tsx`, `global.css`, `app-store.tsx`, docs

**Acceptance:**

- [ ] 3 Nachrichten in 60 s → 2 History-Rows + 1 current
- [ ] >60 s alte Rows verschwinden (live prune)
- [ ] Neue Nachricht: vorherige current → history
- [ ] History-Row-Klick kopiert Text
- [ ] Reply-Compose weiterhin OK (Session-1-Regression)
- [ ] Fensterhöhe passt (Session-2-ResizeObserver)
- [ ] typecheck + tests grün

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
| Session 3 — Notch history (P2) | task | open | IDEAS.md § Session 3 | WIN-NOTCH-002: 60s useNotchHistory MVP | 2026-06-30 |
| Windows duplicate instance on relaunch | bug | idea | `apps/windows/src/main/main.ts` | Windows-Suche startet 2. Instanz; Single-Instance-Lock + Self-Healing (focus existing) | 2026-07-01 |
| UI zu durchsichtig | bug | idea | `apps/windows/src/renderer/styles/global.css` | Opazität/Background dunkler; Kontrast + Lesbarkeit | 2026-07-02 |
| UI nicht scrollbar | bug | idea | `apps/windows/src/renderer` | overflow/scroll-Container fehlt | 2026-07-02 |
| Notch-Widget nicht funktional | bug | idea | `apps/windows/src/renderer/components/NotchWidget.tsx` | Eingeblendetes Notch-Widget reagiert nicht — evtl. WIN-NOTCH-003-Folge, QA reproduzieren | 2026-07-02 |
| "Test notch" aus UI entfernen | task | idea | `apps/windows/src/main/main.ts` (`runNotchDemo`) + Tray-Menü | Nur QA-Feature; vor Release entfernen | 2026-07-02 |
| Logo-Assets einarbeiten | task | idea | `apps/windows` (Icons/Tray/Installer) | App-Icon, Tray-Icon, Fenster-Icon, Installer-Branding | 2026-07-02 |
| Auto-Update planen + bauen | task | idea | `apps/windows` (electron-updater?) | Update-Mechanismus + Release-Feed; erst Architektur festlegen | 2026-07-02 |
| Installations-Script + Handover | task | idea | `apps/windows` (Packaging) | Installer-Script erstellen, an Haupt-Projekt-Admin übergeben | 2026-07-02 |
| Circle-Presence: nicht online angezeigt | bug | **fixed (code) — 2-Client-Confirm offen** | `main.ts` / `session-store.ts` / `identity-store.ts` / `relay-client.ts` | **Behoben 2026-07-02, end-to-end verifiziert** (`[relay] open` + TCP `172.67.222.90:443 Established` zum Prod-Relay; vorher 0 Verbindungen). Ursache NICHT Presence-Logik, sondern (H-D) Dev nutzte userData-Default `%APPDATA%\Electron` + (H-A) Circles auf totem `ws://127.0.0.1:8787`. Fixes: `app.setName('munkel')` (kanonischer Store), Relay-Default→prod via `MUNKEL_RELAY_URL`-Override, Repair persistierter localhost-URLs, H-C RelayClient-Reconnect-Härtung (error-ohne-close) + Tests, Phase-0-Diagnostik-Logging. Guten State nach `%APPDATA%\munkel` migriert (Pablo+Avatar+espresso@prod). typecheck+tests grün (136 pass). **Offen:** finaler 2-Personen-Sichttest mit Kollege. | 2026-07-02 |
