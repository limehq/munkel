# STATE — munkel digest

## Now

Windows: **P1 Parity-Fixes auf Branch `platform/windows/macos-parity-p1` umgesetzt** (Commits `0ef28b8..HEAD`, 7 Stück). Fokus: Dropdown-Readability (P1.1), Enter-Commit Display-Name (P1.2), kompakte Notch-Dynamic-Resize (P1.3), Doc-Sync (P1.4) plus Test-Härtung. `bun test` in `apps/windows`: **216 pass / 3 skip / 0 fail**; `bun run typecheck` clean. Kritischer Review ergab **MAJOR**-Findings (keine CRITICAL): Dropdown-CSS-Zuverlässigkeit auf Windows-Chromium, optimistisches `lastSavedNameRef` vor `updateProfile`-Settle blockiert Retry nach Fehler, `notch-resize` ohne Debounce/Throttle mit Oszillationsrisiko bei Display-Skalierung. Offenes manuelles QA: Notch-Skalierung 100/125/150 %, Dropdown, Enter-Commit.

## Progress

- ✅ **P1.1 Dropdown white-on-white (E1)** — `.frosted-field option` bekommt explizite dark Background/Color in `global.css`; CSS-Test gepinnt.
- ✅ **P1.2 Display-name Enter commit (E2)** — `commitNameOnEnter` in `MenuWindow.tsx` verhindert Default, committed, blurred; `lastSavedNameRef` verhindert Double-Submit.
- ✅ **P1.3 Notch compact + dynamic resize (WIN-NOTCH-004)** — Breite 360→280 px, content-basierte Höhe via `notch-resize` IPC, Clamp [40, 480], Sender-Guard in `main.ts`.
- ✅ **P1.4 Doc-Sync** — Plan 12, Bug-Doc, IPC-Contract aktualisiert.
- ✅ **Test-Härtung** — `NotchWidget.test.tsx` neu, `notch-window.test.ts` + Boundary/Clamp-Tests, `MenuWindow.test.tsx` + Enter/Blur/Whitespace-Fälle, bekannter updateName-Retry-Bug als `it.skip` dokumentiert.
- ✅ (früher) Single-Instance/Self-Heal, Circle-Leave-Dialog, Logo-Assets, Auto-Update, Notch Peek/History — alles in `platform/windows/v2-clean` bzw. darunter gemerged.

## Last

2026-07-10 — P1 Parity-Implementierung auf `platform/windows/macos-parity-p1` abgeschlossen (Tip `77d32c5`). Kritischer Review der 7 Commits seit `0ef28b8` durchgeführt; Review-Findings in `HANDOFF.md` und Plan 12 eingetragen. Doku-Update committed (`docs: update project state and handoff after parity P1 review`).

## Next

1. **P1-Follow-ups fixen** (vor Merge nach `platform/windows/v2-clean`):
   - `lastSavedNameRef` erst nach erfolgreichem `updateProfile` setzen (oder bei Fehler revertieren), damit Retry mit gleichem Namen möglich ist (`MenuWindow.tsx`).
   - `notch-resize` Debounce/Throttle + Subpixel/DPI-Schutz, um Endlos-Resize-Schleifen zu vermeiden.
   - Dropdown-Lösung robust machen (ggf. custom-Dropdown statt nativem `<select>`), da `<option>`-Styling auf Windows-Chromium nicht zuverlässig ist.
2. **Manuelles QA** durchführen: Notch bei 100/125/150 % Display-Skalierung, Dropdown-Farben im laufenden App, Enter-Name-Commit, Retry nach simuliertem Netzwerkfehler.
3. **PR von `platform/windows/macos-parity-p1` → `platform/windows/v2-clean`** öffnen, nach Fix + QA mergen (kein Self-Merge ohne Review).
4. Danach P2 aus Plan 12 angehen (Launch at Login, CLI-Installer, Image-Lightbox, Recipient-Chips).
