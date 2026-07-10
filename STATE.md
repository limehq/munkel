# STATE — munkel digest

## Now

Windows: **P3-Slice (P3.2 Hover-"C"-Copy, P3.3 Unread-Dot, P3.7 Auto-Update-Toggle) auf Branch `platform/windows/macos-parity-p1` umgesetzt, review-gehärtet und code-seitig PR-reif.** Der Iteration-5-Review-Zyklus lief **BLOCK → Härtung → SHIP-mit-Follow-ups** (3 CRITICALs am `globalShortcut`-Lifecycle von P3.2, bestätigt geschlossen nach Commits `6b1550e` / `bc24ed5` / `058fc81`). Teststand in `apps/windows`: **306 pass / 2 skip / 0 fail**; `bun run typecheck` grün. Feature-Parity-Matrix: **25 DONE / 2 PARTIAL / 13 MISSING**. Verbleibend vor dem Merge: **Follow-ups 1 + 2 aus Iteration 5** (Late-Ping-Race, Idle-Timeout-UX), dann das **manuelle QA-Gate** und die **User-Entscheidungen zu Open Questions 4 + 5** (Lightbox-Verhalten, CLI-Distributionsmodell), anschließend entweder P2.2/P2.3 oder der **PR nach `platform/windows/v2-clean`**.

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
- ✅ **P3.2 Hover-"C"-Copy (Iteration 5)** — OS-weiter `globalShortcut('C')`, Renderer armt/disarmed per IPC basierend auf Hover + Reply-Open-State; kopiert hovered Row oder neueste Nachricht. Main-Prozess als Shortcut-Lifecycle-Owner mit 5 Disarm-Pfaden, 4s-Idle-Disarm und Register-Fail-Latch.
- ✅ **P3.3 Unread-Dot (Iteration 5)** — Blauer Dot im retracted Sliver, wenn eine Nachricht ohne Hover/Reply einfährt; cleared bei Hover/Reply. `interacted` als derived State neben `phase`/`newest`, damit keine Drift entsteht.
- ✅ **P3.7 Auto-Update "Check Automatically"-Toggle (Iteration 5)** — Persistenz in `IdentityStore#autoUpdateCheck` (Default `true`), gatet Launch-Check + 24h-Loop; manueller Check bleibt immer erreichbar (Sparkle-Semantik).
- ✅ **Review-Härtung Iteration 5** — Erst-Review BLOCK (3 CRITICALs am globalShortcut-Lifecycle) → Härtungs-Commits `6b1550e` / `bc24ed5` / `058fc81` → Re-Review **SHIP-mit-Follow-ups**. Teststand: **306 pass / 2 skip / 0 fail**.
- ✅ (früher) Single-Instance/Self-Heal, Circle-Leave-Dialog, Logo-Assets, Auto-Update, Notch Peek/History — alles in `platform/windows/v2-clean` bzw. darunter gemerged.

## Last

2026-07-10 — **Iteration 5 Review-Cycle abgeschlossen.** P3.2 (Hover-"C"-Copy), P3.3 (Unread-Dot) und P3.7 (Auto-Update-Toggle) wurden implementiert. P3.2 wurde adversarial gereviewt: Erst-Review **BLOCK** mit 3 CRITICAL-Findings am `globalShortcut`-Lifecycle (Shortcut kann nach stale Hover-Hinweisen systemweit aktiv bleiben). Härtung via Commits `6b1550e` (Main-Owner + 5 Disarm-Pfade), `bc24ed5` (Renderer als Hint-Provider + 4s-Idle-Disarm) und `058fc81` (Register-Fail-Latch + Ref-basierte Copy-Logik). Re-Review Verdikt **SHIP-mit-Follow-ups** — alle CRITICALs bestätigt geschlossen. Teststand: **306 pass / 2 skip / 0 fail**; `bun run typecheck` grün. Doku aktualisiert.

## Next

1. **Iteration-5-Follow-ups 1 + 2 angehen** (vor dem QA-Gate):
   - **MAJOR Late-Ping-Race:** `setActive(true)` main-seitig nur akzeptieren, wenn der Notch sichtbar + interaktiv ist (verhindert, dass verspätete Pings einen frisch disarmten Shortcut re-armen).
   - **MAJOR Idle-Timeout-UX:** "ruhend hovern + C" bricht nach 4s ab — Timeout anheben oder zusätzliches Fokus-/Input-Signal als Aktivitäts-Ping verwenden.
2. **Manuelles QA-Gate** durchführen:
   - Packaged-Build-Autostart für P2.1 (Log-out/-in, Checkbox spiegelt Windows-Startup-Apps wider).
   - Chip-Row Screenreader/Tastatur für P2.4 (Fokus, Pfeiltasten, Auswahl ankündigen).
   - Notch-Flicker/Größe bei 100 % / 125 % / 150 % Display-Skalierung (P1.3).
   - Retry nach simuliertem Relay-Offline im laufenden App (P1.2).
   - P3.2: Hover-C-Copy live testen (row vs. newest, Idle-Disarm, Hide-Disarm).
   - P3.3: Unread-Dot bei retracted Nachricht und Clear-on-Hover.
   - P3.7: "Check Automatically" off über 24h+ im Packaged Build, manueller Check weiterhin erreichbar.
3. **User-Entscheidungen zu Open Questions 4 + 5** einholen:
   - Open Question 4: Lightbox-Verhalten für Bilder (Notch-intern, eigenes Fenster oder System-Viewer?).
   - Open Question 5: CLI-Distributionsmodell (bundled `extraResources` + Menü-Installer oder separate Installation?).
4. Danach entweder **P2.2 (CLI-Installer) + P2.3 (Lightbox)** angehen oder — falls QA + Entscheidungen zeitlich hintenanstehen — den **PR von `platform/windows/macos-parity-p1` → `platform/windows/v2-clean`** öffnen; erst nach Review + grünem CI mergen (kein Self-Merge).
