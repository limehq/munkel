# Review: Plan 16 – Notch History Display Fix (WIN-NOTCH-008)

**Reviewer:** Code-Exploration Sub-Agent  
**Datum:** 2026-07-06  
**Status:** Benötigt Korrektur / Ergänzungen (technischer Kern ist korrekt)  

---

## Kurzbewertung

Der Plan identifiziert die tatsächliche Root Cause richtig: die History wird korrekt befüllt und geprunt, aber im `full`-Zustand wird nur die jeweils neueste Nachricht gerendert. Die vorgeschlagene JSX-Änderung (`expanded = reopening || replyOpen || phase === 'full'`) ist technisch korrekt und löst das gemeldete Problem.

Allerdings fehlen wichtige Edge-Case-Betrachtungen und Präzisierungen, insbesondere zum Verhalten bei geöffnetem Reply, bei Pruning und zur visuellen Auswirkung im `full`-Zustand. Der Plan sollte vor der Umsetzung ergänzt werden.

---

## Konkrete Korrekturvorschläge

### 1. Edge-Case: Reply wird geschlossen, wenn der zugehörige Eintrag geprunt wird

**Befund:** In `apps/windows/src/renderer/components/NotchWidget.tsx:97-103` existiert bereits ein `useEffect`, der `closeReply()` aufruft, sobald `replyingTo` nicht mehr in `history` enthalten ist:

```tsx
useEffect(() => {
  if (!replyingTo) return;
  if (history.some((entry) => entry.id === replyingTo)) return;
  closeReply();
  setReplyText('');
  setError(null);
}, [history, replyingTo, closeReply]);
```

Das bedeutet: Ein geöffneter Reply auf einen älteren Eintrag verschwindet spätestens, wenn dieser Eintrag älter als 60 Sekunden wird und aus der History entfernt wird. Das Ziel "Ein geöffneter Reply auf einen älteren History-Eintrag verschwindet nicht mehr, wenn die Phase in `peek`/`retracted` wechselt" ist damit nur teilweise erfüllt – er bleibt zwar über den Phasenwechsel hinweg sichtbar, aber nicht über das 60-Sekunden-Pruning hinaus.

**Empfohlene Änderung:**
- In der Risikotabelle und in der Zielbeschreibung präzisieren, dass der Reply nur solange sichtbar bleibt, wie der zugehörige Eintrag in der History vorhanden ist.
- Optional prüfen, ob das gewünschte Verhalten ist, dass der Reply auch nach dem Pruning des ursprünglichen Eintrags offen bleiben soll. Falls ja, müsste die Reply-Logik geändert werden (z. B. eigenständiger Reply-Status unabhängig von `history`). Das wäre jedoch ein größerer Eingriff und sollte explizit als separater Task ausgewiesen werden.

### 2. Edge-Case: Neue eingehende Nachricht schließt einen offenen Reply

**Befund:** In `useNotchLifecycle.ts:92-102` ruft `onNotchMessage` bei jeder neuen Nachricht `closeReply()` auf:

```tsx
const onNotchMessage = useCallback((message: NotchMessage) => {
  const entry: NotchHistoryEntry = { ... };
  setHistory((current) => pruneNotchHistory([entry, ...current], Date.now(), NOTCH_HISTORY_MS));
  setHovering(false);
  cancelHoverLeave();
  closeReply();
}, [cancelHoverLeave, closeReply]);
```

Wenn der Nutzer also auf einen älteren Eintrag antwortet und in dieser Zeit eine neue Nachricht eintrifft, wird der Reply verworfen. Das ist aktuell beabsichtigt ("A new message makes any in-flight reply text/context stale"), sollte aber im Plan erwähnt werden, damit die QA das nicht als Regression meldet.

**Empfohlene Änderung:**
- Unter "Edge-Cases" oder "Risiken" erwähnen, dass neue Nachrichten einen offenen Reply schließen.

### 3. Race-Condition: `history.length === 0` während `replyOpen` noch true

**Befund:** Die vorgeschlagene Render-Bedingung lautet:

```tsx
{expanded && history.length > 0 ? (...) : null}
```

Wenn alle History-Einträge geprunt werden, setzt zwar der oben genannte `useEffect` `replyOpen` auf false, aber zwischen dem Pruning und der Effect-Ausführung kann es kurzzeitig vorkommen, dass `expanded` true ist (wegen `replyOpen`), aber `history.length === 0`. In diesem Fenster wird nichts gerendert. Dieser Zustand ist in der Regel nicht sichtbar, aber für einen Komponententest relevant.

**Empfohlene Änderung:**
- Im geplanten Komponententest für `NotchWidget` einen Testfall ergänzen, der prüft, dass bei leerer History der Reply-Bereich nicht mehr gerendert wird (bzw. dass `closeReply` ausgelöst wurde).

### 4. Visuelle Auswirkung im `full`-Zustand

**Befund:** Bisher wurde im `full`-Zustand nur eine einzelne Nachricht kompakt angezeigt. Nach dem Fix wird im `full`-Zustand die gesamte History der letzten 60 Sekunden gerendert (ggf. mit Scrollbar). Das ist das erwartete Verhalten, ändert aber das visuelle Erscheinungsbild erheblich: Die Notch ist in den ersten 5 Sekunden nach einer neuen Nachricht deutlich größer, wenn mehrere Nachrichten im Fenster liegen.

**Empfohlene Änderung:**
- Im Abschnitt "Problem" oder "Goal" explizit beschreiben, dass der `full`-Zustand zukünftig die vollständige History zeigt und nicht mehr nur eine einzelne Nachricht.
- In der manuellen QA betonen, dass die Notch im `full`-Zustand bei mehreren Nachrichten die Höhe der History-Liste annimmt, aber durch `max-height` und `overflow-y: auto` nicht über das Fenster hinauswächst.

### 5. Regression WIN-NOTCH-004 (Oversize)

**Befund:** Das Risiko ist im Plan bereits erkannt und die Mitigation stimmt grundsätzlich. Allerdings sollte die Prüfung nicht nur "visuelles QA" sein, sondern gezielt folgende Szenarien abdecken:
- Viele kurze Nachrichten (z. B. 10+) innerhalb von 60 Sekunden.
- Mehrere Nachrichten mit Bildern im `full`-Zustand.
- Kombination aus langem Text + Bildern + geöffnetem Reply.

**Empfohlene Änderung:**
- Die manuellen QA-Schritte um diese Fälle ergänzen.
- Prüfen, ob `.notch-history-list` im `full`-Zustand tatsächlich das gleiche `max-height` wie im `reopened`-Zustand hat. Der Plan 12 erwähnt `max-height: calc(260px - 26px - 18px - 10px)`; das sollte im `full`-Zustand nach dem Fix weiterhin greifen.

### 6. Test-Strategie ergänzen

**Befund:** Der Plan schlägt einen neuen `NotchWidget`-Komponententest vor. Das ist sinnvoll. Es fehlt aber ein expliziter Test für den Übergang `full → peek`, während ein Reply auf einen älteren Eintrag geöffnet ist. Der bestehende `useNotchLifecycle`-Test `reply open keeps the notch interactive even in peek phase` prüft zwar die Interaktivität, aber nicht das Rendering.

**Empfohlene Änderung:**
- Im neuen `NotchWidget`-Test ergänzen:
  - `full` mit zwei Nachrichten rendert beide.
  - Wechsel nach `peek` bei geöffnetem Reply auf den älteren Eintrag rendert weiterhin die History (inkl. Reply-Feld).
  - Reply auf älteren Eintrag wird geschlossen, wenn eine neue Nachricht eintrifft.
  - Reply auf älteren Eintrag wird geschlossen, wenn der Eintrag geprunt wird.
- Bestehenden `useNotchLifecycle`-Test ergänzen: Prüfen, dass `replyOpen` false wird, wenn der Eintrag geprunt wird (oder der Eintrag nicht mehr in `history` ist).

### 7. `widgetClass`-Logik präzisieren

**Befund:** Die vorgeschlagene `widgetClass`-Logik ist äquivalent zur aktuellen, aber etwas sauberer. Es gibt einen subtilen Unterschied: Wenn `reopening` und gleichzeitig `phase === 'full'` wahr sind (z. B. weil der Nutzer während der initialen 5-Sekunden-Phase über die Notch hovert), wird jetzt eindeutig `notch-reopened` gewählt. Das ist konsistent mit dem aktuellen Verhalten (`reopening` hat Vorrang), sollte aber erwähnt werden.

**Empfohlene Änderung:**
- Kurze Anmerkung im Plan: "`reopening` hat weiterhin Vorrang vor `phase === 'full'`, sodass Hover während der initialen Phase `notch-reopened` rendert."

---

## Korrigierter Plan

Die nachfolgende Version enthält die oben genannten Präzisierungen. Die Code-Änderungen am Kern-JSX bleiben unverändert, da sie korrekt sind.

---

# Plan 16: Notch History Display Fix (WIN-NOTCH-008)

> **Status:** Draft  
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

- In allen geöffneten Zuständen (`full`, `reopened`, reply-open) wird die
  History-Liste gerendert.
- Die History bleibt im 60-Sekunden-Fenster und wird korrekt gekürzt.
- `peek` und `retracted` bleiben kollabiert (nur der Sliver mit Ring/Grabber
  ist sichtbar).
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

`apps/windows/src/renderer/components/NotchWidget.tsx:282-292`:

```tsx
<div className="notch-inner">
  {reopening && history.length > 0 ? (
    <div className="notch-content">
      <div className="notch-history-list">
        {history.map((entry) => renderMessageRow(entry))}
      </div>
    </div>
  ) : newest && (phase === 'full' || replyingTo === newest.id) ? (
    <div className="notch-content">
      <div className="notch-history-list">
        {renderMessageRow(newest)}
      </div>
    </div>
  ) : null}
</div>
```

**Root Cause:** Die History-Liste wird nur gerendert, wenn `reopening`
(Hover) wahr ist. Im `full`-Zustand wird nur `newest` gerendert. Der Nutzer
sieht dort also nie die vorherigen Nachrichten des 60-Sekunden-Fensters.

Zusätzlich hat der `full`-Zweig die Bedingung
`phase === 'full' || replyingTo === newest.id`. Wenn der Nutzer auf einen
älteren History-Eintrag antwortet (`replyingTo !== newest.id`) und die Phase
dann in `peek`/`retracted` wechselt, verschwindet der Reply-Bereich, obwohl
das Widget optisch als `notch-full` expandiert bleibt.

## Konkrete Änderungen

### `apps/windows/src/renderer/components/NotchWidget.tsx`

1. `expanded` um den `full`-Zustand erweitern:

   ```tsx
   const expanded = reopening || replyOpen || phase === 'full';
   ```

2. `widgetClass` mit der neuen `expanded`-Variable vereinfachen. `reopening`
   behält Vorrang vor `phase === 'full'`, sodass Hover während der initialen
   Phase weiterhin `notch-reopened` rendert:

   ```tsx
   const widgetClass = newest
     ? expanded
       ? reopening
         ? 'notch-reopened'
         : 'notch-full'
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

Dadurch wird die History in `full`, `reopened` und bei geöffnetem Reply
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

### Optional / zukünftig

Wenn WIN-NOTCH-007 (Stage-2 Preview) einen neuen Zwischenzustand einführt,
sollte dieser ebenfalls in `expanded` aufgenommen werden, damit die History
auch in der Preview sichtbar ist.

## Edge-Cases

1. **Reply auf älteren Eintrag bleibt über Phasenwechsel sichtbar:** Durch
   `expanded` bleibt die History inkl. Reply-Feld gerendert, wenn `replyOpen`
   true ist – unabhängig davon, ob die Phase `peek` oder `retracted` ist.

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
   - Simuliere Hover (`reopening = true`) und prüfe, dass weiterhin die
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
| Hover-Reopen (WIN-NOTCH-006) könnte durch JSX-Änderung beeinträchtigt werden. | Keine Änderung an `onMouseEnter`/`onMouseLeave` oder `.notch-hover-target`. `reopening` hat weiterhin Vorrang in `widgetClass`. |
| Loading-Ring-Sichtbarkeit (WIN-NOTCH-005) – `full` zeigt jetzt History, aber `peek` bleibt unverändert. | Verifizieren, dass im `peek`-Zustand weiterhin nur der Sliver mit Ring sichtbar ist. |
| Reply auf ältere Einträge verschwindet bei Phasenwechsel. | Durch `expanded && history.length > 0` bleibt der Reply-Bereich sichtbar, solange der Reply offen ist und der zugehörige Eintrag noch in der History liegt. |
| Reply verschwindet unerwartet beim Pruning oder bei neuer Nachricht. | Dokumentieren: Das ist das bestehende Verhalten (`closeReply` in `onNotchMessage` und im `history`-Effect). Bei Bedarf separater Task definieren. |
| Klick-/Hover-Event-Handling auf History-Einträgen könnte mit dem Hover-Target interferieren. | `.notch-full`/`notch-reopened` setzen `pointer-events: none` auf `.notch-hover-target`, sodass Buttons/Klicks auf Einträgen funktionieren. |

## Definition of done

- [ ] `full`-Zustand rendert die vollständige History-Liste.
- [ ] `reopened`-Zustand rendert weiterhin die History-Liste.
- [ ] Geöffneter Reply auf ältere Einträge bleibt nach Phasenwechsel sichtbar.
- [ ] `peek`/`retracted` zeigen keinen History-Inhalt.
- [ ] Einträge werden nach 60s korrekt geprunt.
- [ ] `bun run typecheck` und `bun test` sind grün.
- [ ] Manuelle QA auf Windows bestätigt das erwartete Verhalten, insbesondere
      keine Regression bei WIN-NOTCH-004.

## Commit-Nachricht

```
fix(windows): display recent message history in notch full/reopened states (WIN-NOTCH-008)

The history list was only rendered while `reopening` (hover). In the
`full` phase the widget showed a single newest-message row, so users
never saw the rolling 60-second history when the notch first opened.

- Expand `expanded` to include `phase === 'full'` and `replyOpen`.
- Render `.notch-history-list` whenever `expanded` is true.
- Keep peek/retracted collapsed; no change to lifecycle/pruning logic.

Closes WIN-NOTCH-008
```
