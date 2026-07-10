# STATE — munkel digest

## Now

Windows: **P1 Parity-Fixes auf Branch `platform/windows/macos-parity-p1` umgesetzt** (Commits `d63ea90..HEAD`, 4 Stück: `3f07edb`, `70bff3a`, `433ba2c`, `0a1184b`). Fokus: Retry nach fehlgeschlagenem `updateProfile` (P1.2), Notch-Resize-Debounce/Toleranz (P1.3), Dropdown `color-scheme: dark` (P1.1), Cleanup `expanded`-Inlining. `bun test` in `apps/windows`: **221 pass / 2 skip / 0 fail**; `bun run typecheck` clean. Kritischer Review der 4 Fix-Commits ergab **keine CRITICAL**, aber **zwei MAJOR**-Residual-Findings, die als Follow-ups erfasst sind: `updateName()` serialisiert parallele Submits nicht (out-of-order Resolves können `lastSavedNameRef` stale hinterlassen), und abgelehnte `updateProfile`-Aufrufe geben keinerlei UI-Feedback. Offenes manuelles QA vor dem PR nach `platform/windows/v2-clean`.

## Progress

- ✅ **P1.1 Dropdown white-on-white (E1)** — `.frosted-field option` + `color-scheme: dark` auf `:root` in `global.css`; CSS-Test gepinnt.
- ✅ **P1.2 Display-name Enter commit + Retry (E2)** — `updateName()` in `MenuWindow.tsx` committed `lastSavedNameRef` jetzt erst in `updateProfile(name).then(...)`, damit Retry nach Fehler möglich ist; Regressionstest un-skipped.
- ✅ **P1.3 Notch compact + dynamic resize (WIN-NOTCH-004)** — Renderer-Resize-Observer in `NotchWidget.tsx` debounced (80 ms), Main-Prozess `resizeNotchToContent` toleriert ±1px Höhendifferenz, um Display-Scaling-Oszillationen zu unterbinden.
- ✅ **P1.4 Doc-Sync / Cleanup** — Plan 12 aktualisiert, Branch-Name korrigiert, ungenutzte `expanded`-Variable in `NotchWidget.tsx` inline ersetzt.
- ✅ **Test-Härtung** — `MenuWindow.test.tsx` Retry-Regression, `NotchWidget.test.tsx` Debounce-Tests, `notch-window.test.ts` Toleranz-Tests.
- ✅ (früher) Single-Instance/Self-Heal, Circle-Leave-Dialog, Logo-Assets, Auto-Update, Notch Peek/History — alles in `platform/windows/v2-clean` bzw. darunter gemerged.

## Last

2026-07-10 — Adversarialer Review der 4 Fix-Commits `d63ea90..HEAD` auf `platform/windows/macos-parity-p1` durchgeführt. Review-Findings in `HANDOFF.md` und Plan 12 eingetragen. Doku-Update committed (`docs: update state and handoff after parity P1 major-fix review`).

## Next

1. **P1-Follow-ups fixen** (vor Merge nach `platform/windows/v2-clean`):
   - `MenuWindow.tsx`: Parallele `updateProfile`-Aufrufe serialisieren oder mit Request-Generation tracken, damit out-of-order Resolves `lastSavedNameRef` nicht stale hinterlassen.
   - `MenuWindow.tsx`: UI-Feedback bei abgelehntem `updateProfile` (z. B. kurzzeitiger Error-State oder Input-Visualisierung), damit der User weiß, dass der Name nicht gespeichert wurde.
2. **Manuelles QA** durchführen:
   - Retry nach simuliertem Relay-Offline im laufenden App.
   - Notch-Flicker/Größe bei 125 % und 150 % Display-Skalierung.
   - Dropdown-Farben im Light-Theme-Windows.
3. **PR von `platform/windows/macos-parity-p1` → `platform/windows/v2-clean`** öffnen, nach Fix + QA mergen (kein Self-Merge ohne Review).
4. Danach P2 aus Plan 12 angehen (Launch at Login, CLI-Installer, Image-Lightbox, Recipient-Chips).
