# Follow-up-Scan: P0#12 Update-Bestätigung

**Datum:** 2026-07-07  
**Branch:** `platform/windows/update-signature-fix`  
**Auslöser:** Abschluss-Scan der für P0#12 geänderten Dateien, um keine neuen Schwächen eingebaut zu haben.

## Zusammenfassung

Der Scan wurde mit einem Agent-Swarm über die geänderten Dateien durchgeführt. Es wurden **zwei High-Findings** identifiziert, die beide direkt mit der Update-Bestätigung zusammenhängen und in einem Follow-up-Commit behoben wurden. Die verbleibenden Low-Findings sind überwiegend Maintainability-/Testabdeckungs-Lücken und wurden als P1-Backlog notiert.

| Metrik | Wert |
|---|---|
| Geprüfte Dateien | 7 |
| Kritisch (High) | 2 |
| Warnung (Medium) | 4 |
| Info (Low) | 7 |
| Davon behoben | High + direkt verbundene Medium |
| Tests nach Fix | 18 pass / 0 fail |
| Typecheck | `@munkel/windows` grün |

## Findings und Behandlung

| # | Schwere | Finding | Status | Maßnahme |
|---|---|---|---|---|
| 1 | **High** | `confirm-install-update` / `cancel-install-update` konnten von **jedem Renderer-Fenster** aufgerufen werden; die Bestätigung ließ sich somit umgehen. | ✅ Behoben | In `apps/windows/src/main/main.ts` werden Update-IPC-Handler nun direkt gegen `menuWindow` validiert (`BrowserWindow.fromWebContents(event.sender) !== menuWindow`). |
| 2 | **High** | Ein synchroner Fehler in `quitAndInstall` keilte den State fest, weil `installing = true` nicht zurückgesetzt wurde. | ✅ Behoben | `confirmInstall()` fängt den Fehler, setzt `installing = false` und wechselt in die `error`-Phase. |
| 3 | Medium | TLS-/Zertifikatsfehler wurden fälschlich als Signaturfehler klassifiziert. | ✅ Behoben | `isSignatureError()` prüft nicht mehr auf das Wort `certificate`; Zertifikats-/TLS-Fehler laufen in den bestehenden Secure-Connection-Zweig. |
| 4 | Medium | `check()` konnte während `available` / `downloading` erneut ausgelöst werden. | ✅ Behoben | Guard auf diese Phasen erweitert. |
| 5 | Medium | `cancelInstall()` konnte während eines laufenden Quits die Phase zurücksetzen. | ✅ Behoben | `cancelInstall()` wird ignoriert, solange `installing === true`. |
| 6 | Medium | `dispose()` hat auto-updater-Listener nicht entfernt. | ✅ Behoben | `this.autoUpdater.removeAllListeners()` in `dispose()`. |
| 7 | Low | `downloadedVersion` blieb bei `idle` / `error` erhalten. | ✅ Behoben | Wird in `setPhase()` bei diesen Phasen geleert. |
| 8 | Low | Download-Fortschritt `0%` wurde als "kein Fortschritt" dargestellt. | ✅ Behoben | Bedingung auf `state.progress !== undefined` geändert. |
| 9 | Low | Update-IPC-Handler geben keinen Rückgabewert zurück; UI kann Erfolg/Misserfolg nicht unterscheiden. | 📝 P1 | Keine Code-Änderung; als Backlog-Eintrag notiert. |
| 10 | Low | Kanalnamen sind String-Literale; IPC-Doku ist nicht synchron. | 📝 P1 | Dokumentationspflege und ggf. `ipc-channels.ts` als P1. |
| 11 | Low | `MenuWindow.test.tsx` deckt die `confirm`-Phase nicht ab. | 📝 P1 | Renderer-Testabdeckung als P1. |
| 12 | Low | `getDataTestId`-Helfer ist überkonstruiert / `rollCode` nutzt `Math.random()`. | 📝 P2 | Bereits in `.planning/audit-fix-task.md` unter P2 erfasst. |

## Verifizierte Code-Änderungen

- `apps/windows/src/main/update-service.ts`
  - `confirmInstall()` mit `try/catch` um `quitAndInstall`.
  - `cancelInstall()` ignoriert laufende Installs.
  - `check()` überspringt `available`, `downloading`, `downloaded`, `confirm`.
  - `setPhase()` leert `downloadedVersion` bei `idle`/`error`.
  - `dispose()` ruft `removeAllListeners()`.
  - `isSignatureError()` ohne `certificate`.
- `apps/windows/src/main/main.ts`
  - Update-Handler validieren Sender gegen `menuWindow`.
- `apps/windows/src/renderer/components/MenuWindow.tsx`
  - Fortschrittsanzeige behandelt `0%` korrekt.
- `apps/windows/src/main/__tests__/update-service.test.ts`
  - Tests für Fehlerbehandlung, Cancel-während-Install, Phasen-Guards, Stale-Version.

## Test- und Typecheck-Ergebnis

```bash
bun test apps/windows/src/main/__tests__/update-service.test.ts
# 18 pass / 0 fail / 49 expect() calls

bunx turbo typecheck --filter=@munkel/windows
# 1 successful, 1 total
```

## Verbleibende Arbeit

Die folgenden Punkte sind nicht sicherheitskritisch und werden in P1/P2 behandelt:

- Rückgabewerte für Update-IPC-Actions (`{ ok: boolean }`).
- Zentrale IPC-Kanal-Konstanten und Aktualisierung von `apps/windows/docs/ipc-contract.md`.
- Renderer-Testabdeckung für die `confirm`-Phase.
- Aufräumen von `getDataTestId` und Umstellung von `rollCode` auf `crypto.getRandomValues`.

## Sub-Agent-Verifikation

- Erste Runde: `NEEDS_FIX` wegen unsicherer `getWindowType`-Fallback-Validierung.
- Korrektur: Direkter `menuWindow`-Vergleich in den Update-Handlern.
- Zweite Runde: `APPROVE`.
