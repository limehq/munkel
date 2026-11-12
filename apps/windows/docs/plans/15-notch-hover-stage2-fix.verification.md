# Verifikation: Plan 15 / WIN-NOTCH-007

## Gesamturteil

**Bestanden.** Die Implementierung entspricht den konkreten Code-Änderungen aus `15-notch-hover-stage2-fix.md`. Alle automatisierten Tests sind grün, der Typecheck für `@munkel/windows` ist erfolgreich. Es gibt eine dokumentierte Inkonsistenz innerhalb des Plans (Manual-QA-Punkt 6 vs. State-Machine/Code-Änderungen), die jedoch keinen Code-Change erfordert.

## Prüfergebnisse

### 1. Vollständigkeit der Umsetzung

| Plan-Punkt | Umgesetzt | Nachweis |
|------------|-----------|----------|
| `NotchUiState = 'collapsed' \| 'preview' \| 'open'` | ✅ | `useNotchLifecycle.ts:10` |
| `ui`-State initial `'collapsed'` | ✅ | `useNotchLifecycle.ts:46` |
| `hovering`/`setHovering` entfernt | ✅ | Nicht mehr im Hook vorhanden |
| `reopening = ui === 'open'`, `previewing = ui === 'preview'` | ✅ | `useNotchLifecycle.ts:57-58` |
| `scheduleHoverLeave` basiert auf `ui` | ✅ | `useNotchLifecycle.ts:68-75` |
| `reopenFromHoverTarget` setzt `ui = 'preview'`, ignoriert `phase === 'full'` | ✅ | `useNotchLifecycle.ts:82-86` |
| `openFromPreview` setzt `ui = 'open'` | ✅ | `useNotchLifecycle.ts:77-80` |
| `onNotchMessage` setzt `ui = 'collapsed'` | ✅ | `useNotchLifecycle.ts:108` |
| `onNotchReopen` setzt `ui = 'open'` | ✅ | `useNotchLifecycle.ts:155-158` |
| `onNotchHide` setzt `ui = 'collapsed'` und schließt Reply | ✅ | `useNotchLifecycle.ts:150-154` |
| Reset auf `collapsed` bei leerer History | ✅ | `useNotchLifecycle.ts:168-172` |
| Interaktivität für `preview`/`open` | ✅ | `useNotchLifecycle.ts:175-178` |
| `NotchWidget` verwendet `ui` | ✅ | `NotchWidget.tsx:34, 49-56, 289-313` |
| Preview-Oberfläche rendern (Avatar, Sender, Snippet) | ✅ | `NotchWidget.tsx:267-281, 309-312` |
| Hover-Target nur bei `ui === 'collapsed'` | ✅ | `NotchWidget.tsx:289-291` |
| CSS-Transform `.notch-preview` | ✅ | `global.css:553-560` |
| `.notch-preview-content` Layout | ✅ | `global.css:562-594` |
| `pointer-events: none` für Hover-Target in `preview`/`full` | ✅ | `global.css:615-619` |

### 2. Entfernung von `hovering`/`setHovering`

Die alten State-Setter und die `hovering`-Variable sind vollständig aus dem Hook entfernt. Stattdessen steuert `ui` alle Hover-/Open-Zustände. `reopening` und `previewing` sind abgeleitete Konstanten.

### 3. Funktion der neuen `ui`-State-Machine

- `collapsed` → nur Sliver/Grabber sichtbar.
- `preview` → Stage-2 Vorschau mit neuestem Eintrag, klickbar, Timer läuft weiter.
- `open` → volle Historie/Reply-Ansicht.

Transitionen:
- `onNotchMessage` → `collapsed`
- Hover über `collapsed` bei `phase !== 'full'` → `preview`
- Klick auf Preview → `open`
- Mouse-Leave aus `preview` → `collapsed`
- Mouse-Leave aus `open` → bleibt `open`
- `onNotchReopen` → `open`
- `onNotchHide` → `collapsed`
- History leer → `collapsed`

### 4. Tests

Alle 19 Tests in `useNotchLifecycle.test.ts` bestehen:

```text
19 pass
0 fail
80 expect() calls
```

Die geforderten Testfälle aus dem Plan sind abgedeckt:

1. Neue Nachricht setzt `ui` auf `collapsed` und startet `phase = full`.
2. Hover-Target wechselt zu `preview`, nicht `open`.
3. Hover-Target tut nichts bei `phase === 'full'`.
4. Klick auf Preview öffnet `open`.
5. Mouse-Leave aus `preview` kehrt zu `collapsed` zurück.
6. Mouse-Leave aus `open` ändert nichts.
7. Timer-Expiry pruned auch in `preview`.
8. Interaktivität folgt `preview`/`open`.
9. Externes `onNotchReopen` öffnet `open`.
10. Externes `onNotchHide` kollabiert UI und schließt Reply.

Zusätzlich sind sinnvolle Regressionstests enthalten (StrictMode, leere-History-Hide, Reply-Interaktivität, Clipboard, Timer-Cleanup).

### 5. Regressionsrisiken

**Gering.** Folgende Punkte wurden geprüft:

- `phase`-Lifecycle hängt weiterhin ausschließlich von `newest?.id` ab (`useNotchLifecycle.ts:132`). `ui` ist nicht im Dependency-Array.
- Der 60-Sekunden-Prune-Interval läuft unabhängig von `ui` weiter (`useNotchLifecycle.ts:135-143`).
- `preview` setzt `notchSetInteractive(true)` korrekt.
- `notchEmpty`-Timer ist absichtlich **nicht** an `ui` gekoppelt, damit ein fehlendes `mouseleave`-Event (bekanntes Windows-Problem) den Notch nicht blockiert.

**Offene Anmerkung / Plan-Inkonsistenz:**

Im Manual-QA-Punkt 6 des Plans steht:

> If `phase` is `peek`/`retracted`, view collapses after leave delay.

Dies widerspricht jedoch den konkreten Code-Änderungen und dem Zustandsdiagramm im Plan, die `open` als persistenten Zustand behandeln, der nur durch `onNotchHide`, leere History oder explizites Klicken beeinflusst wird. Die aktuelle Implementierung (`scheduleHoverLeave` lässt `ui === 'open'` unverändert) ist konsistent mit den Code-Änderungen und sinnvoll, da ein explizit geöffneter Notch nicht automatisch einklappen sollte, nur weil die Maus das Fenster verlässt.

**Empfohlene Aktion:** Manual-QA-Punkt 6 im Plan anpassen oder explizit als „gewolltes Verhalten“ dokumentieren. Kein Code-Change nötig.

Ein weiteres kleines Detail: `global.css` enthält noch Regeln für `.notch-reopened`, obwohl `NotchWidget.tsx` diese Klasse nicht mehr emitted (sie wurde mit `notch-full` verschmolzen). Das ist toter CSS-Code, aber kein Regressionsrisiko.

### 6. Test- und Build-Ergebnisse

- `bun test apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts` → **19/19 passing**
- `bun run typecheck --filter=@munkel/windows` → **successful**

## Fazit

Die Code-Änderungen sind technisch korrekt und decken alle in den konkreten Code-Änderungen des Plans beschriebenen Punkte ab. Die Tests sind sinnvoll und grün. Es ist keine Nachbesserung am Code erforderlich. Die einzige Aktion betrifft die Plan-Dokumentation (Manual-QA-Punkt 6).
