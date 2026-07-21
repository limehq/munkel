# Verifikation: Plan 13 – Notch peek loading ring fix (WIN-NOTCH-005)

**Gesamturteil:** Bestanden – alle Planpunkte sind korrekt umgesetzt.

**Geprüfte Dateien:**
- `apps/windows/docs/plans/13-notch-loading-ring-fix.md`
- `apps/windows/docs/plans/13-notch-loading-ring-fix.review.md`
- `apps/windows/src/renderer/styles/global.css`
- `apps/windows/src/renderer/components/NotchWidget.tsx`

**Automatisierte Checks (ausgeführt in `apps/windows`):**
- `bun run typecheck`: ✅ grün
- `bun test`: ✅ 195 pass, 2 skip (Electron-only Bild-Codec), 0 fail

---

## Punktweise Verifikation gegen den Plan

### 1. `.notch-sliver` (`global.css:576–589`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `top: 8px` → `bottom: 0` | Zeile 578 | ✅ |
| `height: 20px` beibehalten | Zeile 586 | ✅ |
| `display: inline-flex` beibehalten | Zeile 581 | ✅ |
| `align-items: center` beibehalten | Zeile 582 | ✅ |
| `justify-content: center` beibehalten | Zeile 583 | ✅ |
| `gap: 8px` beibehalten | Zeile 584 | ✅ |
| Opacity/Transform-Transition beibehalten | Zeile 588 | ✅ |
| Geschwister von `.notch-inner` bleiben | JSX Zeilen 272/282 | ✅ |

### 2. `.notch-widget.notch-peek` (`global.css:545–547`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| Exposed height 18 px → 20 px | `translateY(calc(-100% + 20px))` | ✅ |

### 3. `.notch-widget.notch-retracted` (`global.css:549–551`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| Exposed height 8 px → 12 px | `translateY(calc(-100% + 12px))` | ✅ |

### 4. `.notch-full .notch-sliver, .notch-reopened .notch-sliver` (`global.css:591–595`)

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| Keine Änderung nötig | `opacity: 0; transform: translate(-50%, -8px);` unverändert | ✅ |

### 5. `NotchWidget.tsx`

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| Keine JSX-Änderungen für WIN-NOTCH-005 | Sliver-Renderbedingung Zeile 273 unverändert, SVG-Attribute unverändert | ✅ |
| Sliver bleibt Geschwister von `.notch-inner` | Zeilen 272 und 282 auf gleicher Ebene | ✅ |
| `RING_RADIUS = 8` und `RING_CIRCUMFERENCE` unverändert | Zeilen 8–9 | ✅ |

### 6. Hauptprozess

| Planvorgabe | Umsetzung | Status |
|---|---|---|
| `NOTCH_HEIGHT = 260` beibehalten | Nicht geändert | ✅ |

---

## Gefundene Probleme mit Korrekturvorschlägen

Keine Code-Probleme gefunden. Die CSS-Änderungen sind syntaktisch korrekt, minimal und am richtigen Ort.

### Hinweis: Branch-Name

Der Plan nennt als Feature-Branch `platform/windows/notch-loading-ring-fix`. Das Working Directory befindet sich aktuell auf `platform/windows/notch-regression-docs`. Solange die Änderungen isoliert in den korrekten Feature-Branch überführt werden, ist das kein technisches Problem.

### Hinweis: Abhängigkeit zu WIN-NOTCH-006

`.notch-hover-target` (`global.css:562–568`) liegt weiterhin bei `top: 0` und ist damit nicht über dem sichtbaren Sliver-Bereich. Das ist beabsichtigt und im Plan als separater Fix für WIN-NOTCH-006 dokumentiert. Nach dem Merge beider Fixes muss geprüft werden, ob der Hover-Target den sichtbaren Sliver-Bereich abdeckt.

---

## Bestätigung technischer Korrektheit

- Die CSS-Änderungen sind syntaktisch korrekt und liegen exakt an den im Plan genannten Stellen.
- `.notch-sliver` ist weiterhin Geschwisterknoten von `.notch-inner` und wird daher nicht durch `.notch-inner { overflow: hidden; }` geclippt.
- Die Peek-/Retracted-Transforms passen die sichtbare Höhe so an, dass der 20 px-Sliver bzw. der Grabber vollständig sichtbar sind.
- Die Ring-Geometrie und Animation wurden nicht verändert; der 30-s-Drain bleibt erhalten.
- `bun run typecheck` und `bun test` sind fehlerfrei durchgelaufen.
- Es gibt keine offensichtlichen Regressionen gegenüber Plan 12 (WIN-NOTCH-004); der `.notch-inner`-Wrapper aus Plan 12 bleibt unberührt.

**Empfohlene nächste Schritte:**
1. Manuelles QA auf Windows durchführen: Ring komplett sichtbar in `peek`, Grabber in `retracted`.
2. `prefers-reduced-motion: reduce` prüfen (statischer Halbdrain-Zustand).
3. 125 % / 150 % Display-Skalierung testen.
4. WIN-NOTCH-006 (Hover-Target) separat umsetzen und zusammen mit diesem Fix erneut auf Hover-Reopen prüfen.
