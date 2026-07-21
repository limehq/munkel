# Review: Plan 13 – Notch peek loading ring fix (WIN-NOTCH-005)

**Geprüfte Datei:** `apps/windows/docs/plans/13-notch-loading-ring-fix.md`
**Gesamtbewertung:** Passt mit kleinen Korrekturen / Präzisierungen.

Der Plan erkennt die tatsächliche Ursache (Sliver oben positioniert, sichtbarer Bereich aber unten) und schlägt den richtigen, minimalen Fix vor. Die CSS-Änderungen sind technisch korrekt und risikoarm. Die Root-Cause-Formulierung sollte leicht präzisiert werden, und zwei Verifikationspunkte fehlen.

---

## 1. Datei- und Zeilenangaben

| Angabe im Plan | Status | Bemerkung |
|---|---|---|
| `global.css:576-589` (`.notch-sliver`) | ✅ korrekt | – |
| `global.css:545-547` (`.notch-widget.notch-peek`) | ✅ korrekt | – |
| `global.css:549-551` (`.notch-widget.notch-retracted`) | ✅ korrekt | – |
| `global.css:591-595` (`.notch-full/.notch-reopened .notch-sliver`) | ✅ korrekt | – |
| `NotchWidget.tsx:273-278` (Ring-Renderbedingung) | ✅ korrekt | – |

---

## 2. Root-Cause-Analyse – präzisieren

Der Plan stellt dar, WIN-NOTCH-005 sei erst durch Plan 12 (WIN-NOTCH-004) sichtbar geworden, weil das Widget nun auf ~44 px kollabiert. Das ist nur die halbe Wahrheit:

- **Grundlegendes Problem:** `.notch-sliver` sitzt bei `top: 8px`, die Peek-/Retracted-Transforms belassen aber jeweils nur den **unteren** Rand des Widgets im sichtbaren Bereich. Der Sliver ist also schon immer am falschen Ende verankert gewesen.
- **Rolle von Plan 12:** Durch Wegfall von `min-height: 100%` kollabiert das Widget in `peek` tatsächlich auf die reine Padding-Höhe (~44 px). Vor Plan 12 war es 260 px hoch; auch da lag der Sliver außerhalb des sichtbaren unteren 18-px-Streifens, aber der Unterschied war weniger offensichtlich, weil der sichtbare Bereich weiter vom Sliver entfernt war.

**Korrekturvorschlag:** Die Analyse sollte klar sagen, dass Plan 12 das Problem nicht verursacht, sondern **verschärft/offengelegt** hat, weil die vertikale Fehlausrichtung jetzt eine totale statt eine partiale Clipping-Lücke ist.

---

## 3. Vorgeschlagener Fix – technisch korrekt und minimal

Die vorgeschlagenen Änderungen sind die kleinstmögliche Lösung:

1. `.notch-sliver` von `top: 8px` auf `bottom: 0` setzen.
2. Peek-Transform von `calc(-100% + 18px)` auf `calc(-100% + 20px)` erhöhen.
3. Retracted-Transform von `calc(-100% + 8px)` auf `calc(-100% + 12px)` erhöhen.

### Begründung

- Der Sliver ist 20 px hoch. Bei `bottom: 0` deckt sich seine Höhe exakt mit dem sichtbaren 20-px-Peek-Bereich → Ring + Grabber sind vollständig sichtbar.
- Im Retracted-Zustand wird der Ring nicht gerendert (`phase === 'peek' && !expanded`). Der 4 px hohe Grabber ist im 20-px-Sliver vertikal zentriert (y = 8–12 px). Um ihn vollständig sichtbar zu halten, müssen mindestens 12 px des unteren Widget-Bereichs sichtbar sein. Die Erhöhung auf 12 px ist daher mathematisch korrekt.
- Der Sliver bleibt Geschwisterknoten von `.notch-inner`, sodass `.notch-inner { overflow: hidden; }` ihn nicht clippt. Das ist konsistent mit Plan 12.

### Randnotiz Border-Radius

`.notch-widget` hat `border-radius: 0 0 var(--munkel-radius-xl) var(--munkel-radius-xl);` (20 px unten). Der Sliver ist 20 px hoch und horizontal zentriert; Ring/Grabber liegen nicht in den abgerundeten Ecken, sodass keine visuelle Abschneidung zu erwarten ist.

---

## 4. Konsistenz mit Plan 12 (WIN-NOTCH-004)

- Plan 12 hat `.notch-widget` zu einem Flex-Container gemacht und `.notch-inner` mit `overflow: hidden` eingeführt. `.notch-sliver` ist `position: absolute` und Geschwister von `.notch-inner`; die Umpositionierung nach unten beeinflusst das Flex-Layout nicht.
- Kein Konflikt mit `max-height: 100%` oder `.notch-inner { min-height: 0; }`.
- Keine Änderungen an `NOTCH_HEIGHT = 260` nötig.

---

## 5. Bessere / kleinere Lösung?

Nein. Die vorgeschlagene Lösung ist bereits der kleinste sinnvolle Fix. Alternativen wie
- den Sliver oben lassen und stattdessen die Transforms auf den oberen Bereich ausrichten, oder
- einen zweiten Ring am unteren Rand duplizieren,
sind aufwendiger oder visuell inkonsistent.

---

## 6. Tests und Verifikation

- `bun run typecheck` und `bun test` sind sinnvoll, decken aber das CSS-Layout nicht ab.
- Es gibt keine `NotchWidget.test.tsx` und keine visuellen Regressionstests. Das ist im Plan zwar implizit durch „Manual QA required“ erfasst, sollte aber explizit als Akzeptanzkriterium stehen.
- Der Plan sollte explizit festhalten, dass **keine neuen Unit-Tests** nötig sind, weil es sich um ein visuelles Layout-Problem handelt.

### Ergänzende QA-Schritte

1. Während `peek` muss der **komplette** 20-px-Ring sichtbar sein (nicht nur der untere Teil).
2. Beim Übergang `full → peek` darf der Ring nicht kurzzeitig abgeschnitten erscheinen.
3. Im `retracted`-Zustand muss der Grabber vollständig sichtbar sein, der Ring jedoch nicht.
4. `prefers-reduced-motion: reduce` prüfen: Der Ring zeigt den statischen Halbdrain-Zustand an.
5. Display-Skalierung 125 % / 150 % wiederholen.
6. WIN-NOTCH-006 (Hover-Reopen) bewusst ausklammern, aber dokumentieren, dass der Hover-Target weiterhin `top: 0` hat und deshalb separat gefixt werden muss.

---

## 7. Risiken / Regressionstraps

Die Risiken im Plan sind korrekt und vollständig. Zusätzlich:

- **DOM-Struktur:** Beim Implementieren darf `.notch-sliver` nicht versehentlich in `.notch-inner` verschoben werden, sondern muss Geschwisterknoten bleiben.
- **Hot-Reload-Verhalten:** Die Änderung von `top` auf `bottom` wird nicht von `transition` animiert (`transition` deckt nur `opacity` und `transform` ab). Bei einem dynamischen Wechsel würde der Sliver hart springen; im regulären Lifecycle ändert sich seine Position aber nicht, sondern nur ihre Sichtbarkeit.

---

## 8. Aktualisierter Plan

Die technische Lösung des Plans kann so übernommen werden. Folgende inhaltliche Präzisierungen sollten vor der Umsetzung in die Plan-Datei `13-notch-loading-ring-fix.md` übernommen werden:

### 8.1 Root-Cause (Absatz 4)

**Original:**
> After Plan 12 (WIN-NOTCH-004) the widget is content-aware and collapses to roughly its padding height (~44 px) when no message content is rendered. The visible bottom area of the collapsed widget therefore no longer overlaps the sliver, which sits near the top of the widget. The ring is rendered above the visible window area and is effectively clipped off-screen.

**Korrigiert:**
> The fundamental mismatch is therefore: the sliver (ring + grabber) lives near the **top** of the widget, but the visible peek/retracted tab is the **bottom** part of the widget. Plan 12 (WIN-NOTCH-004) made the widget content-aware: in `peek` it collapses to roughly its padding height (~44 px) because no message content is rendered. This turned a partial clipping issue into a near-total one — the sliver is now almost completely above the visible window area.

### 8.2 CSS-Änderungen für `.notch-sliver`

**Original:**
> - The sliver must remain a sibling of `.notch-inner` so it is not clipped by `.notch-inner { overflow: hidden; }`.

**Ergänzen um:**
> - Note: `.notch-widget` has a 20 px bottom border-radius, but the sliver is horizontally centered and the ring/grabber do not reach into the corners, so no clipping occurs.

### 8.3 Component-Änderungen

**Original:**
> - No JSX changes required. Keep the existing ring render condition at line 273:

**Korrigiert:**
> - No JSX changes required. Keep the sliver as a sibling of `.notch-inner` and keep the existing ring render condition at line 273:

### 8.4 Verifikation

**Original:**
> These validate TypeScript and business logic but not the visual layout. A manual QA pass on Windows is required.

**Korrigiert:**
> These validate TypeScript and business logic but not the visual layout. No new unit tests are added for this change because the bug is purely visual/CSS-based. A manual QA pass on Windows is required.

### 8.5 Manuelle QA-Schritte

**Original Schritt 3:**
> 3. Observe the peek sliver:
>    - A white progress ring is visible.
>    - The ring drains counter-clockwise over ~30 s.

**Korrigiert:**
> 3. Observe the peek sliver:
>    - A white progress ring is visible.
>    - The **entire** 20 px ring is visible (not just the bottom half).
>    - The ring drains counter-clockwise over ~30 s.

**Original Schritt 4:**
> 4. Wait another ~30 s for `peek → retracted`.
>    - The ring disappears.
>    - A minimal grabber tab remains visible.

**Korrigiert:**
> 4. Wait another ~30 s for `peek → retracted`.
>    - The ring disappears.
>    - A minimal grabber tab remains fully visible.

### 8.6 Definition of Done

**Original:**
> - [ ] The ring is visible during the entire 30-second peek phase.
> - [ ] The ring animation still drains over 30 s.

**Korrigiert:**
> - [ ] The ring is visible during the entire 30-second peek phase.
> - [ ] The entire 20 px ring is visible (no partial clipping at the top).
> - [ ] The ring animation still drains over 30 s.

### 8.7 Risiken / Regressionstraps

**Original (vor dem Hover-Trap):**
> - **Visual change in full/reopened states:** The sliver is hidden in these states via `opacity: 0`, so moving it to the bottom has no visual effect there. Verify the fade-out animation still looks correct.
> - **Hover detection (WIN-NOTCH-006):** ...

**Korrigiert:**
> - **Visual change in full/reopened states:** The sliver is hidden in these states via `opacity: 0`, so moving it to the bottom has no visual effect there. Verify the fade-out animation still looks correct.
> - **DOM structure regression:** `.notch-sliver` must stay a sibling of `.notch-inner`. If it is accidentally moved inside `.notch-inner`, it will be clipped by `overflow: hidden`.
> - **Hot-reload / dynamic position change:** `top`/`bottom` are not covered by the sliver's `transition` (only `opacity` and `transform`). In a normal lifecycle the sliver position is static, so this is not an issue; it only matters if the property is toggled dynamically.
> - **Hover detection (WIN-NOTCH-006):** ...

---

**Empfehlung:** Plan mit den oben genannten Präzisierungen übernehmen; keine Änderungen an der technischen Lösung nötig.
