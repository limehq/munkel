# Plan 16: Notch History Display Fix (WIN-NOTCH-008)

> **Status:** Implemented / Verified  
> **Branch:** `platform/windows/notch-history-display-fix`  
> **Base:** `platform/windows/v2-clean`  
> **Estimate:** 1 session  
> **Type:** Bug fix / UX

## Problem

WIN-NOTCH-008: Der Verlauf der letzten Nachrichten wird in der Notch nicht
angezeigt. Wenn die Notch im `full`-Zustand automatisch geöffnet ist (die ersten
5 Sekunden nach einer neuen Nachricht), sieht der Nutzer nur die jeweils
aktuellste Nachricht – nicht die History der letzten 60 Sekunden. Erst beim
Hover über den Sliver wird die vollständige History sichtbar.

## Goal

- In allen geöffneten Zuständen (`full`, `open`, reply-open) wird die
  History-Liste gerendert.
- Die History bleibt im 60-Sekunden-Fenster und wird korrekt gekürzt.
- `peek`/`retracted` und `preview` bleiben kollabiert (nur der Sliver mit
  Ring/Grabber bzw. die einzeilige Preview ist sichtbar).
- Ein geöffneter Reply auf einen älteren History-Eintrag verschwindet nicht
  mehr, wenn die Phase in `peek`/`retracted` wechselt.
- Der `full`-Zustand zeigt zukünftig die vollständige History (ggf. scrollbar),
  nicht mehr nur eine einzelne Nachricht.

## Root-Cause-Analyse

### 1. Nachrichtenfluss in die History ist korrekt

Eingehende Nachrichten erreichen den Renderer und werden der History
hinzugefügt:

- `apps/windows/src/main/group-session.ts:295-303` (Chat) und `:333-342`
  (Bild) rufen `callbacks.onNotch(...)` mit `receivedAt` auf.
- `apps/windows/src/main/session-store.ts:56-58` leitet `onNotch` an den im
  `AppState`-Konstruktor übergebenen Callback weiter.
- `apps/windows/src/main/main.ts:81-85` (`showNotchMessage`) sendet
  `'notch-update'`, `'notch-show'` und `'notch-message'`.
- `apps/windows/src/renderer/components/NotchWidget.tsx:76-82` hört auf
  `window.electronAPI.onNotchMessage` und ruft
  `lifecycle.onNotchMessage(data)` auf.

Die History wird also befüllt; das Problem liegt nicht im Transport oder im
State-Management.

### 2. Pruning ist korrekt

- `apps/windows/src/renderer/lib/prune-notch-history.ts:1-7` filtert korrekt
  mit `now - Date.parse(item.receivedAt) < windowMs`.
- `apps/windows/src/renderer/lib/useNotchLifecycle.ts:126-134` führt das
  Pruning jede Sekunde aus.

### 3. Rendering zeigt die History nur im Hover-Zustand

`apps/windows/src/renderer/components/NotchWidget.tsx:302-314`:

```tsx
<div className="notch-inner">
  {ui === 'open' || phase === 'full' ? (
    <div className="notch-content">
      <div className="notch-history-list">
        {ui === 'open' ? history.map((entry) => renderMessageRow(entry)) : newest && renderMessageRow(newest)}
      </div>
    </div>
  ) : ui === 'preview' && newest ? (
    <div className="notch-preview-content" onClick={openFromPreview}>
      {renderPreview(newest)}
    </div>
  ) : null}
</div>
```

**Root Cause:** Die History-Liste wird nur im `ui === 'open'`-Zustand
(Hover/Click) vollständig gerendert. Im `full`-Zustand wird nur `newest`
gerendert. Der Nutzer sieht dort also nie die vorherigen Nachrichten des
60-Sekunden-Fensters.

Zusätzlich bleibt ein geöffneter Reply auf einen älteren History-Eintrag
unsichtbar, sobald die Phase in `peek`/`retracted` wechselt, weil der
Vollansicht-Render-Zweig dann nicht mehr erreicht wird.

## Konkrete Änderungen

### `apps/windows/src/renderer/components/NotchWidget.tsx`

1. `expanded` um den `full`-Zustand erweitern:

   ```tsx
   const expanded = ui === 'open' || replyOpen || phase === 'full';
   ```

2. `widgetClass` mit der neuen `expanded`-Variable vereinfachen. `ui === 'open'`
   behält Vorrang vor `phase === 'full'`, sodass Hover während der initialen
   Phase weiterhin `notch-reopened` rendert:

   ```tsx
   const widgetClass = newest
     ? expanded
       ? ui === 'open'
         ? 'notch-reopened'
         : 'notch-full'
       : ui === 'preview'
         ? 'notch-preview'
         : `notch-${phase}`
     : 'notch-retracted';
   ```

3. Die geschachtelte Render-Bedingung durch eine einzige, auf `expanded`
   basierende Bedingung ersetzen:

   ```tsx
   <div className="notch-inner">
     {expanded && history.length > 0 ? (
       <div className="notch-content">
         <div className="notch-history-list">
           {history.map((entry) => renderMessageRow(entry))}
         </div>
       </div>
     ) : null}
   </div>
   ```

Dadurch wird die History in `full`, `open` und bei geöffnetem Reply
angezeigt. Der `full`-Zustand zeigt die neueste Nachricht ganz oben in der
Liste, gefolgt von den älteren Einträgen.

### Keine Änderungen notwendig in

- `apps/windows/src/renderer/lib/useNotchLifecycle.ts` – History-State und
  Pruning sind bereits korrekt.
- `apps/windows/src/renderer/lib/prune-notch-history.ts` – Pruning-Logik ist
  korrekt.
- `apps/windows/src/main/group-session.ts`, `main.ts`, `notch-window.ts`,
  `broadcast-state.ts` – IPC-Weiterleitung ist korrekt.
- `apps/windows/src/renderer/styles/global.css` – `.notch-history-list` hat
  bereits `max-height` und `overflow-y: auto`.

### Nicht in Scope

- `preview` soll weiterhin nur die neueste Nachricht als einzeilige
  Vorschau anzeigen; die vollständige History wird erst nach Klick oder
  im `full`-Zustand sichtbar.

## Edge-Cases

1. **Reply auf älteren Eintrag bleibt über Phasenwechsel sichtbar:** Durch
   `expanded` bleibt die History inkl. Reply-Feld gerendert, wenn `replyOpen`
   true ist – unabhängig davon, ob die Phase `peek` oder `retracted` ist
   oder `ui` auf `collapsed` steht.

2. **Reply wird geschlossen, wenn der zugehörige Eintrag geprunt wird:** In
   `NotchWidget.tsx:97-103` wird `closeReply()` aufgerufen, sobald
   `replyingTo` nicht mehr in `history` enthalten ist. Ein Reply auf einen
   Eintrag verschwindet also spätestens nach 60 Sekunden. Das ist das aktuelle
   Verhalten und wird nicht geändert.

3. **Neue Nachricht schließt einen offenen Reply:** In
   `useNotchLifecycle.onNotchMessage` wird bei jeder neuen Nachricht
   `closeReply()` aufgerufen. In-flight Reply-Text wird verworfen, wenn eine
   neue Nachricht eintrifft.

4. **Race-Condition nach Pruning:** Zwischen dem Entfernen des letzten
   History-Eintrags und der Ausführung des `useEffect` kann kurzzeitig
   `replyOpen === true && history.length === 0` gelten. In diesem Fall rendert
   die vorgeschlagene Bedingung nichts; der `useEffect` schließt den Reply
   unmittelbar danach.

## Test-Strategie

### Automatisierte Tests

1. **Unit-Test für `useNotchLifecycle`**
   (`apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts`):
   - Ergänzen: Expliziter Test, der mehrere Nachrichten im 60s-Fenster
     hinzufügt und prüft, dass `history` alle enthält, während Einträge >60s
     entfernt werden.
   - Ergänzen: Test, der prüft, dass `replyOpen` false wird, wenn der
     Reply-Eintrag aus der History geprunt wird.

2. **Komponenten-Test für `NotchWidget`** neu anlegen
   (`apps/windows/src/renderer/components/__tests__/NotchWidget.test.tsx`):
   - Simuliere zwei eingehende Nachrichten innerhalb von 60s.
   - Prüfe, dass im `full`-Zustand beide Nachrichten in
     `.notch-history-list` gerendert werden.
   - Simuliere Hover/Click (`ui = 'open'`) und prüfe, dass weiterhin die
     History gerendert wird.
   - Simuliere, dass eine Nachricht älter als 60s wird, und prüfe, dass sie
     aus der Liste verschwindet.
   - Prüfe, dass ein geöffneter Reply auf einen älteren Eintrag auch nach
     dem Wechsel in `peek` sichtbar bleibt.
   - Prüfe, dass der Reply geschlossen wird, wenn eine neue Nachricht
     eintrifft.
   - Prüfe, dass der Reply geschlossen wird, wenn der zugehörige Eintrag
     geprunt wird.

3. **Typprüfung und Testlauf:**

   ```bash
   cd apps/windows
   bun run typecheck
   bun test
   ```

### Manuelle QA

1. Windows-App im Dev-Modus starten und einem Circle beitreten.
2. Mehrere Nachrichten innerhalb von 60 Sekunden von einem anderen Client
   senden.
3. Beobachten:
   - Die Notch öffnet sich im `full`-Zustand und zeigt alle Nachrichten der
     letzten 60s (neueste oben). Sie ist dabei ggf. deutlich höher als vor
     dem Fix, aber nicht größer als das Notch-Fenster.
   - Nach ~5s wechselt sie in `peek` (nur Sliver mit Ring sichtbar).
   - Hover öffnet die History weiterhin vollständig.
   - Nach 60s seit der ältesten Nachricht verschwindet diese aus der History.
   - Sind alle Einträge >60s alt, wird die Notch nach kurzer Verzögerung
     ausgeblendet.
4. Regressionstests für WIN-NOTCH-004:
   - 10+ kurze Nachrichten innerhalb von 60s: Notch bleibt im Fenster,
     History scrollt.
   - Mehrere Nachrichten mit Bildern im `full`-Zustand: Kein vertikaler
     Overflow.
   - Lange Nachricht + Bilder + geöffneter Reply: Höhe bleibt begrenzt.

## Risiken / Rückfalltrichten

| Risiko | Mitigation |
|--------|-----------|
| WIN-NOTCH-004 (Oversize) könnte zurückkommen, weil jetzt mehr Inhalt im `full`-Zustand gerendert wird. | `.notch-widget` hat `max-height: 100%`, `.notch-inner` hat `overflow: hidden`, `.notch-history-list` hat `max-height: calc(260px - 26px - 18px - 10px)` und `overflow-y: auto`. Visuelles QA auf Windows mit vielen Nachrichten, Bildern und Reply. |
| Hover-Reopen (WIN-NOTCH-007) könnte durch JSX-Änderung beeinträchtigt werden. | Keine Änderung an `onMouseEnter`/`onMouseLeave` oder `.notch-hover-target`. `ui === 'open'` hat weiterhin Vorrang in `widgetClass`. |
| Loading-Ring-Sichtbarkeit (WIN-NOTCH-005) – `full` zeigt jetzt History, aber `peek` bleibt unverändert. | Verifizieren, dass im `peek`-Zustand weiterhin nur der Sliver mit Ring sichtbar ist. |
| Reply auf ältere Einträge verschwindet bei Phasenwechsel. | Durch `expanded && history.length > 0` bleibt der Reply-Bereich sichtbar, solange der Reply offen ist und der zugehörige Eintrag noch in der History liegt. |
| Reply verschwindet unerwartet beim Pruning oder bei neuer Nachricht. | Dokumentieren: Das ist das bestehende Verhalten (`closeReply` in `onNotchMessage` und im `history`-Effect). Bei Bedarf separater Task definieren. |
| Klick-/Hover-Event-Handling auf History-Einträgen könnte mit dem Hover-Target interferieren. | `.notch-full`/`notch-reopened` setzen `pointer-events: none` auf `.notch-hover-target`, sodass Buttons/Klicks auf Einträgen funktionieren. |

## Definition of done

- [x] `full`-Zustand rendert die vollständige History-Liste.
- [x] `open`-Zustand (Hover/Click) rendert weiterhin die History-Liste.
- [x] Geöffneter Reply auf ältere Einträge bleibt nach Phasenwechsel sichtbar.
- [x] `peek`/`retracted`/`preview` zeigen keinen vollständigen History-Inhalt.
- [x] Einträge werden nach 60s korrekt geprunt.
- [x] `bun run typecheck` und `bun test` sind grün.
- [ ] Manuelle QA auf Windows bestätigt das erwartete Verhalten, insbesondere
      keine Regression bei WIN-NOTCH-004.

## Commit-Nachricht

```
fix(windows): display recent message history in notch full/open states (WIN-NOTCH-008)

The history list was only rendered while `ui === 'open'` (hover/click).
In the `full` phase the widget showed a single newest-message row, so
users never saw the rolling 60-second history when the notch first opened.

- Expand `expanded` to include `phase === 'full'` and `replyOpen`.
- Render `.notch-history-list` whenever `expanded` is true.
- Keep peek/retracted/preview collapsed; no change to lifecycle/pruning logic.

Closes WIN-NOTCH-008
```
