# STATE — munkel digest

## Now

Windows: **P2.1 Launch-at-Login und P2.4 Avatar-Chip-Recipient-Picker auf Branch `platform/windows/macos-parity-p1` umgesetzt, review-gehärtet und code-seitig PR-reif.** Beide Punkte haben den Iteration-4-Adversarial-Review mit dem Verdikt **SHIP-mit-Follow-ups** bestanden. Teststand in `apps/windows`: **259 pass / 2 skip / 0 fail**; `bun run typecheck` grün. Feature-Parity-Matrix: **22 DONE / 2 PARTIAL / 16 MISSING**. Verbleibend vor dem Merge: das **manuelle QA-Gate** (Packaged-Build-Autostart, Chip-Row Screenreader/Tastatur plus die P1-Punkte Notch-Skalierung und Relay-Offline-Retry), die **User-Entscheidungen zu Open Questions 4 + 5** (Lightbox-Verhalten, CLI-Distributionsmodell) und anschließend entweder P2.2/P2.3 oder der **PR nach `platform/windows/v2-clean`**.

## Progress

- ✅ **P1.1 Dropdown white-on-white (E1)** — `.frosted-field option` + `color-scheme: dark` auf `:root` in `global.css`; CSS-Test gepinnt.
- ✅ **P1.2 Display-name Enter commit + Retry + Race-Härtung (E2)** — `updateName()` in `MenuWindow.tsx` serialisiert parallele Submits per Generation, verhindert Enter+Blur-Doppel-Submit per `inFlightNameRef` und committed `lastSavedNameRef` erst bei erfolgreichem `updateProfile`-Resolve.
- ✅ **P1.3 Notch compact + dynamic resize (WIN-NOTCH-004)** — Renderer-Resize-Observer in `NotchWidget.tsx` debounced (80 ms), Main-Prozess `resizeNotchToContent` toleriert ±1px Höhendifferenz, um Display-Scaling-Oszillationen zu unterbinden.
- ✅ **P1.4 Doc-Sync / Cleanup** — Plan 12 aktualisiert, Branch-Name korrigiert, ungenutzte `expanded`-Variable in `NotchWidget.tsx` inline ersetzt.
- ✅ **Review-Härtung Iteration 3** — Review-Verlauf BLOCK (CRITICAL Enter+Blur-Doppel-Submit) → Fix `b2eea7a` → Re-Review Verdikt SHIP mit 2 INFO-Punkten als optionale Follow-ups.
- ✅ **P2.1 Launch at Login / Autostart (opt-in)** — `app.setLoginItemSettings` via testbarem `login-item.ts`, Persistenz in `IdentityStore#launchAtLogin` (Default `false`), Anwendung beim Startup; Settings-Popover zeigt optimistic Checkbox mit Snap-back bei OS-Fehler.
- ✅ **P2.4 Avatar-Chip-Recipient-Picker** — `RecipientChipRow` ersetzt native `<select>` durch Globe-"All"-Chip + pro Mitglied einen Avatar+Name-Chip; horizontale Scroll, `title`-Tooltip, unveränderter `onRecipientChange`-Vertrag.
- ✅ **Review-Härtung Iteration 4** — Adversarialer Review erkannte 2 MAJOR (Menu-Sender-Guard auf launch-at-login-IPC, Dev-Mode-Skip via `app.isPackaged` mit falscher Skip=Erfolg-Semantik) und 2 MINOR (Toggle-inFlight-Guard, Chip-Row radiogroup/roving-tabindex/Pfeiltasten). Alle in `1fd33f2` bzw. `da8e294` behoben; Re-Review Verdikt **SHIP-mit-Follow-ups**.
- ✅ **Test-Härtung** — `MenuWindow.test.tsx` um Launch-at-Login-IPC-Verhalten erweitert; `login-item.test.ts` und `identity-store.test.ts` ergänzt; Chip-Row-Tests für Rendering, Auswahl, Leerzustand und Vertrag.
- ✅ (früher) Single-Instance/Self-Heal, Circle-Leave-Dialog, Logo-Assets, Auto-Update, Notch Peek/History — alles in `platform/windows/v2-clean` bzw. darunter gemerged.

## Last

2026-07-10 — **Iteration 4 Review-Cycle abgeschlossen.** P2.1 und P2.4 wurden adversarial gereviewt. Ergebnis: 2 MAJOR-Findings (Menu-Sender-Guard auf `SET_LAUNCH_AT_LOGIN`-IPC fehlte, Dev-Mode-Skip markierte `app.isPackaged === false` fälschlich als Erfolg) und 2 MINOR-Findings (Toggle ohne inFlight-Guard, Chip-Row fehlte `radiogroup`/`roving-tabindex`/`Pfeiltasten`). Fixes in Commits `1fd33f2` (MAJOR) und `da8e294` (MINOR). Re-Review Verdikt **SHIP-mit-Follow-ups**. Teststand: **259 pass / 2 skip / 0 fail**; `bun run typecheck` grün. Doku aktualisiert.

## Next

1. **Manuelles QA-Gate** durchführen:
   - Packaged-Build-Autostart für P2.1 (Log-out/-in, Checkbox spiegelt Windows-Startup-Apps wider).
   - Chip-Row Screenreader/Tastatur für P2.4 (Fokus, Pfeiltasten, Auswahl ankündigen).
   - Notch-Flicker/Größe bei 100 % / 125 % / 150 % Display-Skalierung (P1.3).
   - Retry nach simuliertem Relay-Offline im laufenden App (P1.2).
2. **User-Entscheidungen zu Open Questions 4 + 5** einholen:
   - Open Question 4: Lightbox-Verhalten für Bilder (Notch-intern, eigenes Fenster oder System-Viewer?).
   - Open Question 5: CLI-Distributionsmodell (bundled `extraResources` + Menü-Installer oder separate Installation?).
3. Danach entweder **P2.2 (CLI-Installer) + P2.3 (Lightbox)** angehen oder — falls QA + Entscheidungen zeitlich hintenanstehen — den **PR von `platform/windows/macos-parity-p1` → `platform/windows/v2-clean`** öffnen; erst nach Review + grünem CI mergen (kein Self-Merge).
