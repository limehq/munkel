# STATE — munkel digest

## Now

Windows: **P1 Parity-Fixes auf Branch `platform/windows/macos-parity-p1` umgesetzt und code-seitig PR-reif.** Display-Name-Save ist jetzt race-frei durch eine Dreifach-Mechanik aus monotoner Request-Generation (`nameSaveGenerationRef`), in-flight-Tracking (`inFlightNameRef`) und erfolgsgebundenem `lastSavedNameRef`. Teststand in `apps/windows`: **227 pass / 2 skip / 0 fail**; `bun run typecheck` clean. Einziger verbleibender Schritt vor dem Merge ist das **manuelle QA-Gate** (Retry nach Relay-Offline, Error-Hint-Optik / 4s-Dismiss, Notch bei 100/125/150 % Display-Skalierung, Dropdown im Light-Theme), danach PR nach `platform/windows/v2-clean`.

## Progress

- ✅ **P1.1 Dropdown white-on-white (E1)** — `.frosted-field option` + `color-scheme: dark` auf `:root` in `global.css`; CSS-Test gepinnt.
- ✅ **P1.2 Display-name Enter commit + Retry + Race-Härtung (E2)** — `updateName()` in `MenuWindow.tsx` serialisiert nun parallele Submits per Generation, verhindert Enter+Blur-Doppel-Submit per `inFlightNameRef` und committed `lastSavedNameRef` erst bei erfolgreichem `updateProfile`-Resolve.
- ✅ **P1.3 Notch compact + dynamic resize (WIN-NOTCH-004)** — Renderer-Resize-Observer in `NotchWidget.tsx` debounced (80 ms), Main-Prozess `resizeNotchToContent` toleriert ±1px Höhendifferenz, um Display-Scaling-Oszillationen zu unterbinden.
- ✅ **P1.4 Doc-Sync / Cleanup** — Plan 12 aktualisiert, Branch-Name korrigiert, ungenutzte `expanded`-Variable in `NotchWidget.tsx` inline ersetzt.
- ✅ **Review-Härtung Iteration 3** — Review-Verlauf BLOCK (CRITICAL Enter+Blur-Doppel-Submit) → Fix `b2eea7a` → Re-Review Verdikt SHIP mit 2 INFO-Punkten als optionale Follow-ups.
- ✅ **Test-Härtung** — `MenuWindow.test.tsx` Retry-Regression, Out-of-Order-Resolve-Test, Doppel-Submit-Test, Error-Hint-Test; `NotchWidget.test.tsx` Debounce-Tests; `notch-window.test.ts` Toleranz-Tests.
- ✅ (früher) Single-Instance/Self-Heal, Circle-Leave-Dialog, Logo-Assets, Auto-Update, Notch Peek/History — alles in `platform/windows/v2-clean` bzw. darunter gemerged.

## Last

2026-07-10 — **Iteration 3 Review-Cycle abgeschlossen.** Erster adversarialer Review ergab BLOCK wegen CRITICAL Enter+Blur-Doppel-Submit (synchrones Promise-Mock verdeckte das Problem im ersten Testlauf). Fix via synchronem `inFlightNameRef` in `b2eea7a`. Re-Review Verdikt **SHIP** mit 2 INFO-Punkten: (1) Test „Blur mit anderem Namen während in-flight“ könnte ergänzt werden; (2) theoretisches Haängenbleiben von `inFlightNameRef`, falls `updateProfile` synchron wirft. Beides als optionale Follow-ups erfasst, kein Blocker. Doku aktualisiert.

## Next

1. **Manuelles QA-Gate** durchführen:
   - Retry nach simuliertem Relay-Offline im laufenden App.
   - Error-Hint-Optik und 4s-Auto-Dismiss beobachten.
   - Notch-Flicker/Größe bei 100 % / 125 % / 150 % Display-Skalierung.
   - Dropdown-Farben im Light-Theme-Windows.
2. **PR von `platform/windows/macos-parity-p1` → `platform/windows/v2-clean`** öffnen; erst nach Review + grünem CI mergen (kein Self-Merge).
3. Danach P2 aus Plan 12 angehen (Launch at Login, CLI-Installer, Image-Lightbox, Recipient-Chips).
