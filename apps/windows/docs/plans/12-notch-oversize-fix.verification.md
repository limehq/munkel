# Verifikation: Plan 12 – Notch vertical oversize fix (WIN-NOTCH-004)

**Gesamturteil:** Umgesetzt mit kleinen Einschränkungen – Nachbesserung empfohlen.

**Geprüfte Dateien:**
- `apps/windows/docs/plans/12-notch-oversize-fix.md`
- `apps/windows/src/renderer/styles/global.css`
- `apps/windows/src/renderer/components/NotchWidget.tsx`
- `apps/windows/src/renderer/lib/__tests__/notch-phase.test.ts`
- `apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts`
- `apps/windows/src/renderer/components/__tests__/NotchWidget.test.tsx` (nicht vorhanden)

**Automatisierte Checks (ausgeführt in `apps/windows`):**
- `bun run typecheck`: ✅ grün
- `bun test`: ✅ 195 pass, 2 skip (Electron-only Bild-Codec), 0 fail

---

## Punktweise Verifikation gegen den Plan

### 1. `.notch-widget` (`global.css:497-517`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `min-height: 100%` entfernen | Ersetzt durch `max-height: 100%` | ✅ |
| `max-height: 100%` hinzufügen | Vorhanden in Zeile 498 | ✅ |
| `display: flex; flex-direction: column;` | Zeilen 514-515 | ✅ |
| `overflow: hidden;` | Zeile 516 | ✅ |
| Padding/Background/Transforms unverändert | Unverändert | ✅ |
| Einrückung an Zeile 498 auf Tabs normalisieren | `max-height: 100%` nutzt Tabs | ✅ |

### 2. `.notch-content` (`global.css:635-642`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `flex: 1 1 auto; min-height: 0;` | Zeilen 639-640 | ✅ |
| `overflow-y: auto;` | Zeile 641 | ✅ |

### 3. `.notch-history-list` (`global.css:644-651`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `max-height` an Fenster anpassen | `calc(260px - 26px - 18px - 10px)` | ✅ |
| `overflow-y: auto;` beibehalten | Zeile 649 | ✅ |

### 4. `.message-text` (`global.css:711-722`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `max-height: 4.5em` | Zeile 717 | ⚠️ siehe Probleme |
| `overflow: hidden;` | Zeile 718 | ✅ |
| Optional `-webkit-line-clamp: 4` | Zeilen 719-721 | ✅ |

### 5. `.image-preview-row` (`global.css:948-957`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| Einzeilig mit `flex-wrap: nowrap` | Zeile 950 | ✅ |
| Horizontal scrollen mit `overflow-x: auto` | Zeile 953 | ✅ |

### 6. `NotchWidget.tsx` – `full`-Branch (`NotchWidget.tsx:286-290`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| Einzelnachricht in height-capped Wrapper packen | `renderMessageRow(newest)` ist jetzt in `.notch-history-list` gewrappt | ✅ |

### 7. Hauptprozess (`notch-window.ts`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `NOTCH_HEIGHT = 260` beibehalten | Zeile 11 unverändert | ✅ |
| Content-aware resizing out-of-scope | Nicht umgesetzt, wie geplant | ✅ |

---

## Gefundene Probleme mit Korrekturvorschlägen

### 1. `overflow: hidden` auf `.notch-widget` kann Schatten/Animation beschneiden

**Befund:** Der Plan warnt ausdrücklich vor diesem Regressionstrap (`Risks / regression traps` und `Manual QA step 7`). Die Implementierung legt `overflow: hidden` direkt auf `.notch-widget`, obwohl der Plan vorschlägt, es bei Bedarf auf einen inneren Wrapper zu verschieben.

**Korrekturvorschlag:** Einen zusätzlichen inneren Wrapper (z. B. `.notch-inner`) einführen, der das Flex-Layout und `overflow: hidden` trägt, während `.notch-widget` selbst das `::before`-Shadow-Pseudo und die `notch-enter`-Animation ohne Clipping-Risiko rendern kann.

### 2. `max-height: 4.5em` passt nicht zu `-webkit-line-clamp: 4`

**Befund:** Bei `font-size: 14px` und `line-height: 1.35` beträgt die Höhe einer Zeile `1.35 * 14px = 18.9px`. Vier Zeilen benötigen also `4 * 18.9px = 75.6px`. `4.5em` entspricht jedoch nur `4.5 * 14px = 63px`, also etwa 3,3 Zeilen. Da `max-height` die vom `-webkit-line-clamp: 4` vorgesehene Box-Höhe nach oben begrenzt, kann die vierte Zeile abgeschnitten werden.

**Korrekturvorschlag:** `max-height` auf die tatsächliche 4-Zeilen-Höhe setzen:

```css
.message-text {
  max-height: 5.4em; /* 4 * 1.35em ≈ 4 Zeilen */
}
```

### 3. Fehlende Komponenten-Tests

**Befund:** Es existiert keine `NotchWidget.test.tsx`. Die geänderte JSX-Struktur im `full`-Branch wird daher nicht automatisch geprüft. CSS-Layout wird generell nicht durch Unit-Tests abgedeckt.

**Korrekturvorschlag (optional):** Einen Render-Test hinzufügen, der prüft, dass eine einzelne Nachricht im `full`-State innerhalb von `.notch-content > .notch-history-list` gerendert wird.

---

## Bestätigung technischer Korrektheit

- Die CSS-Änderungen sind syntaktisch korrekt und liegen an den im Plan genannten Stellen.
- Die Component-Änderung (`full`-Branch wrappt `renderMessageRow(newest)` in `.notch-history-list`) ist korrekt und erreicht die gewünschte Höhenbegrenzung für Einzelnachrichten.
- `bun run typecheck` und `bun test` sind ohne Fehler durchgelaufen.
- Der Planpunkt „Main-Prozess unverändert“ ist eingehalten (`NOTCH_HEIGHT = 260`).

**Empfohlene nächste Schritte:**
1. Manuelles QA auf Windows durchführen, insbesondere Schatten/Animation (Plan Schritt 7) und 4-Zeilen-Textclipping.
2. Entscheiden, ob `overflow: hidden` auf `.notch-widget` belassen oder auf einen inneren Wrapper verschoben wird.
3. `max-height: 4.5em` auf `5.4em` korrigieren, um Konsistenz mit `-webkit-line-clamp: 4` zu gewährleisten.
4. Optional: `NotchWidget`-Render-Test für den `full`-Branch ergänzen.
