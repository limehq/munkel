# Review: Plan 08 – Notch vertical oversize fix (WIN-NOTCH-004)

**Datei geprüft:** `apps/windows/docs/plans/08-notch-oversize-fix.md`  
**Gesamtbewertung:** Benötigt Korrektur.

Der Plan identifiziert viele richtige Code-Stellen und nennt plausible CSS-Risiken. Er übersieht aber den wesentlichen Grund für das als „oversized“ empfundene Verhalten und schlägt deshalb einen Fix vor, der das QA-Ziel „compact pill, no empty space below the message“ nicht erfüllen kann. Die folgenden Punkte müssen angepasst werden.

---

## 1. Nummerierungskonflikt

`apps/windows/docs/plans/README.md` listet Plan 08 bereits als **„Orphaned Electron store cleanup“** (merged). Die neue Plan-Datei sollte umbenannt werden, z. B. in `12-notch-oversize-fix.md`, damit die Plan-Sequenz nicht doppelt belegt ist.

## 2. Datei- und Zeilenangaben

| Angabe im Plan | Status | Bemerkung |
|---|---|---|
| `apps/windows/src/renderer/styles/global.css:497-514` (.notch-widget) | korrekt | – |
| `apps/windows/src/renderer/styles/global.css:632-636` (.notch-content) | korrekt | – |
| `apps/windows/src/renderer/styles/global.css:638-645` (.notch-history-list) | korrekt | – |
| `apps/windows/src/renderer/styles/global.css:705-711` (.message-text) | korrekt | – |
| `apps/windows/src/renderer/styles/global.css:937-954` (.image-preview-row) | ungenau | `.image-preview-row` ist nur **937–945**; 947–954 gehört zu `.image-preview-thumb`. |
| `apps/windows/src/renderer/components/NotchWidget.tsx:282-288` | korrekt | – |
| `apps/windows/src/main/notch-window.ts:11` | korrekt | – |

Zusätzlich fällt in `global.css:498` eine Mischung aus Spaces (zwei Leerzeichen) und Tabs auf; beim Editieren sollte die Einrückung auf Tabs normalisiert werden.

## 3. Root-Cause-Analyse – unvollständig

Der Plan nennt fehlende Höhenbegrenzungen und fehlendes `overflow`, übersieht aber:

1. **`.notch-widget { min-height: 100% }` zwingt das Widget, das feste 260 px-Fenster komplett auszufüllen.**  
   Auch bei einer einzeiligen Nachricht ist das Widget also 260 px hoch; der dunkle Hintergrund füllt den gesamten Bereich. Das erklärt die Nutzerbeschreibung „mehrere Kasten nach unten“ besser als ein reines Overflow-Problem.
2. **`.notch-history-list { max-height: 220px }` ist für das feste Fenster zu groß.**  
   Padding oben/unten beträgt 26 px + 18 px = 44 px. 220 px + 44 px = 264 px, also 4 px mehr als das 260 px-Fenster. Mit `overflow: hidden` auf dem Widget werden diese 4 px abgeschnitten; sauberer wäre eine von der Fensterhöhe abgeleitete Maximalhöhe.
3. **Der eigentliche Bug-Report erwartet ein inhaltsabhängiges „compact pill“.**  
   Der Plan hält `NOTCH_HEIGHT = 260` fest und will das Widget mit `height: 100%` auf diese Größe zwingen. Das ist technisch konsistent mit Plan 05 („window stays physically fixed at 360 × 260“), steht aber im Widerspruch zum QA-Schritt „no empty space below the message“.

## 4. Vorgeschlagener Fix – technisch nicht zielführend

Die im Plan vorgeschlagenen Änderungen (`.notch-widget` auf `height: 100%`, Flex-Container, `overflow: hidden`) lösen zwar das Overflow-Szenario für lange Nachrichten/Bilder, aber:

- Sie **bekommen das Leer-raum-Problem für kurze Nachrichten nicht in den Griff**.
- `overflow: hidden` auf `.notch-widget` clippt den `::before`-Schatten und kann die `notch-enter`-Animation beschneiden. Der Plan nennt das als Risk, bietet aber keine Lösung.
- `height: 100%` anstelle von `min-height: 100%` ist ein größerer Eingriff als nötig.

### Empfohlene kleinere Lösung

Lass das Widget am Inhalt orientieren, begrenze es aber maximal auf das Fenster:

- `.notch-widget`:
  - `min-height: 100%` entfernen.
  - `max-height: 100%` hinzufügen.
  - `overflow: hidden` hinzufügen (oder besser: Clipping auf ein inneres Wrapper-Element verlagern, damit Schatten/Animation nicht abgeschnitten werden).
  - Optional: `display: flex; flex-direction: column;` für die Kinder beibehalten.
- `.notch-content`:
  - `flex: 1 1 auto; min-height: 0;` hinzufügen, damit es im Flex-Layout schrumpfen kann.
  - `overflow-y: auto;` hinzufügen.
- `.notch-history-list`:
  - `max-height: 220px` anpassen, z. B. `max-height: calc(260px - 26px - 18px - 10px)` ≈ 206 px, oder `max-height: 100%` in Verbindung mit der flex-basierten `.notch-content`.
- `.message-text`:
  - `max-height: 4.5em` (ca. 4 Zeilen) und `overflow: hidden`.
  - Optional `display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical;` für Ellipsen.
- `.image-preview-row`:
  - Eine Zeile mit `flex-wrap: nowrap; overflow-x: auto;` bevorzugen, oder
  - `max-height` für maximal zwei Zeilen (`2 * 72px + gap`).
- `NotchWidget.tsx`:
  - Einzelnachrichten in einen Wrapper mit derselben Höhenbegrenzung wie `.notch-history-list` packen, anstatt `renderMessageRow(newest)` direkt in `.notch-content` zu rendern.

Diese Variante ist kleiner, vermeidet das Leer-raum-Problem und hält das Widget innerhalb des festen Fensters.

## 5. Tests und Verifikation

- `bun run typecheck` und `bun test` sind sinnvoll, fangen aber **keine CSS-Layout-Probleme** ab.
- Es gibt derzeit keinen visuellen/snapshot-Test für `NotchWidget`. Der Plan sollte explizit einen manuellen Screenshot-Vergleich oder die Ergänzung eines Render-Tests vorsehen (z. B. Prüfung, dass die Einzelnachricht in einem Wrapper mit der Klasse `notch-single-message` gerendert wird).
- Der QA-Schritt „Single short text message: no empty space below the message“ ist mit einem festen 260 px-Fenster und `height: 100%` nicht erreichbar. Entweder muss das QA-Ziel angepasst oder die Fenstergröße inhaltsabhängig werden.

## 6. Konsistenz mit bestehendem Design

Plan 05 definiert: „The notch window stays physically fixed at 360 × 260; collapse is done via CSS transforms only.“ Der korrigierte Fix bleibt bei diesem Design, lässt das Widget aber innerhalb des Fensters schrumpfen. Eine inhaltsabhängige Fenstergröße (IPC `resizeNotchToContent`) wäre ein separater, größerer Design-Entscheid und sollte nicht als „optional“ im selben Bugfix behandelt werden.

---

**Empfehlung:** Plan als `12-notch-oversize-fix.md` neu anlegen und den ursprünglichen `08-notch-oversize-fix.md` löschen. Die korrigierte Fassung ist im Plan `12-notch-oversize-fix.md` enthalten.
