# Handoff — munkel (2026-07-10)

## current_state

- **Aktueller Branch:** `platform/windows/macos-parity-p1` (Tip `4ca7b73`).
- **Working directory:** sauber bis auf untracked `fp-notes/` (nie committen).
- **Kontext:** **P0 „UI unsichtbar" gefixt und laufzeit-verifiziert** (Bug A: `ELECTRON_RUN_AS_NODE`-Leak → `setName`-Crash; Bug B: sandboxed Preload konnte ausgelagerten IPC-Chunk nicht laden → gesamtes UI tot). Davor: P3 komplett (Iteration 8), Clipboard-Security-Pfad reviewt+SHIP (Iteration 6/7).
- **Test-Stand:** `bun test` in `apps/windows`: **455 pass / 3 skip / 0 fail**; `bun run typecheck` clean.

## completed in dieser Session

### Follow-up-Sweep nach P0 (2026-07-10)

Entscheidungsfreie Härtungen aus zwei Review-Zyklen, alle SHIP (Kimi: nur Low/Nits): `b5f4c90` + `4ca7b73` (Preload-Gate-Tokenizer: fail-closed gegen non-literale requires, Regex-Literal- + Template-Interpolation-State — P0-Kernfall bleibt gefangen), `f3704b5` (dev.mjs 150ms-Restart-Debounce gegen Doppel-Start bei geteilten Modulen), `16206c0` (Notch history/single-view max-height am 480px-Fenster-Clamp kohärent, Content scrollt statt zu clippen), `3944c0b` (Tests: expanded-history pruning-while-visible, FULL→PEEK-pulse, Chevron `type="button"`), `59ea216` (`ownedClipboardTempPaths` FIFO-Cap 200 — Lösch-Autorität-Invariante hält, evictierte Pfade fallen auf 1h-Sweep zurück). Teststand **455 pass / 3 skip / 0 fail**. Offen (optional, Kimi Low/INFO): Tokenizer-`/`-nach-`}`-Ambiguität (fail-closed), 439px-CSS-Konstante ohne Compile-Link zu `NOTCH_MAX_HEIGHT`, dev-Timer `unref`.

### P0-Fix — „UI komplett unsichtbar beim Start" (2026-07-10)

- **Symptom (User):** beim Start von Munkel nichts von der UI sichtbar. **Diagnose via Live-Repro** (geloggter `bun run dev`), nicht aus HANDOFF — zwei getrennte Ursachen, keine davon in den statischen Hypothesen (Single-Instance-Lock, Boot-Exceptions, Notch-Clamp, versteckter Tray waren ALLE falsch; auch der Notch-Resize-Verdacht wurde widerlegt).
- **Bug A — `ELECTRON_RUN_AS_NODE`-Leak (`c7f14bd`):** Das Flag ist im VS-Code-/Claude-Host-Env gesetzt (nicht persistent — User/Machine-Scope leer, Parent-Kette pwsh←claude←Code-Insiders) und wurde von `dev.mjs` per `{...process.env}` an Electron durchgereicht → echte Binary lief als Node → `require('electron')` = Pfad-String → `app` undefined → `app.setName()` wirft an `main.ts:37` beim Modul-Laden → Main stirbt vor jedem Fenster. Fix: `ELECTRON_RUN_AS_NODE` aus dem Electron-Child-Env in `dev.mjs` gelöscht + defensiv in `launch-munkel-dev.cmd`.
- **Bug B — Preload lädt nicht (`3406772`):** IPC-Zentralisierung (`4b7f492`) importierte `../shared/ipc-channels` in main UND preload → Vite (lib mode, 2 Entries) lagerte es in einen Chunk aus → `dist/preload.cjs` enthielt `require("./ipc-channels-*.cjs")`, das ein **sandboxed Preload nicht laden darf** → `Unable to load preload script` → `window.electronAPI` in jedem Renderer undefined → `NotchWidget`/Menü/Palette crashen. Fix: getrennte single-entry Vite-Builds (`vite.main.config.ts` + neue `vite.preload.config.ts`, `inlineDynamicImports:true`) → Preload self-contained; `clean-dist.mjs` (one-time clear, `emptyOutDir:false`) + Build-Gate `check-preload-selfcontained.mjs` + `preload-build.test.ts` als Regressionsschutz.
- **Verifikation:** Orchestrator-Live-Repro aus vergifteter Shell → alle 3 Crash-Signaturen 0, Main bootet (`restoreCircles {count:2}`, Relays `open`), keine Renderer-Fehler. Kimi-Review: **SHIP-mit-Follow-ups** (nur MINOR: Gate-Regex gegen require-in-String/Template-Literal härten; Doppel-Restart im Dev debouncen). Bug-Doc: `docs/bugs/windows-ui-invisible-2026-07-10.md`. Commits: `3406772`, `c7f14bd`, `fd7ff74`. Teststand **430 pass / 2 skip / 0 fail**.

## completed in dieser Session

### Iteration 8 — P3-Abschluss: pulse + P3.6 + P3.1 (2026-07-10)

- **Umsetzung (Sonnet):** `5acfb69` (pulse-Verdrahtung: Ring nur im Full-View-Branch der neuesten Message, nie beim History-Reopen), `d8e0a2d` (P3.6: History-Rows default collapsed mit Ellipsis, Chevron-Toggle als eigene Affordance — Row-Klick bleibt Click-to-Reply; Expanded-State id-basiert, gepruned beim Aging), `24d6340` (P3.1: Rebindable Palette-Hotkey — `palette-hotkey.ts` DI-Modul, geteilter `accelerator.ts`-Validator, Recorder im Settings-Popover, sender-guarded IPC), `33f13c0` (Doku). Damit ist die **P3-Tabelle komplett** (alle 7 Tasks DONE).
- **Review (gesplittet wegen 10-min-Wrapper-Limit):** Teil 1 (P3.1): **BLOCK** — Rollback nicht atomar im Doppel-Fehler-Pfad (App hotkey-los bei behaupteter Bindung, nur Neustart heilt); MINOR `Shift+A`-Footgun. Teil 2 (P3.6+pulse): **SHIP** mit Follow-ups (220px-`max-height` deckelt resize-on-expand — scrollt intern statt Fenster wachsen zu lassen; Overflow >480px unverifiziert; 3 fehlende Tests).
- **Fix `8ba4574`:** Confirmed-Binding-Invariante (`accelerator: string|null` trägt nur OS-bestätigte Bindings), expliziter `rollback-failed`, einmalige Default-Heilung auf `Ctrl+Shift+M`, Renderer „Not bound"-State mit Hint + Retry-Heilung ohne Neustart, Shift-only-Combos abgelehnt (starker Modifier Pflicht). **Re-Review: SHIP** (Residual-INFO: nach Dreifach-Fehler bleibt der persistierte Combo bewusst als Retry-Target, während nichts gebunden ist).
- **Teststand:** **429 pass / 2 skip / 0 fail** (von 357 → +72 Tests in Iteration 8); typecheck grün. Matrix: **28 DONE / 2 PARTIAL / 10 MISSING**.
- **Betrieb:** Session-Limit unterbrach die Runde zweimal (Reset 12:30); Fixer und Reviewer wurden nahtlos resumed, keine Verluste. Der große Gesamt-Review lief ins 10-min-Wrapper-Limit → Regel: Reviews in Teil-Delegationen splitten.
- **next_action:** Iteration-8-Follow-ups (220px-Cap-Entscheidung, Overflow >480px, 3 Tests), dann manuelles QA-Gate + Open Questions 4/5 (User), dann PR nach `platform/windows/v2-clean` (kein Self-Merge).

### Iteration 7 — Security-Review-Zyklus für `fad3300` (2026-07-10)

- **Nachreview `fad3300` (Kimi k2.6): Verdikt BLOCK.** 2 MAJORs: (1) `isClipboardTempPath` prüfte nur den Basename und `send-images` hatte keinen Sender-Guard — kombiniert ein potenzielles Datei-Lösch-Primitiv für kompromittierte Renderer (Renderer-gelieferter Pfad wie `…\Documents\munkel-clipboard-x.png` wäre nach Send gelöscht worden); (2) Re-Arm-Cooldown auf `Date.now()` — NTP-Rücksprung hätte Hover-C dauerhaft un-armable gemacht.
- **Fix `2757681` — Lösch-Autorität = Ownership-Set:** Nur Pfade, die der `save-clipboard-image`-Handler dieser Instanz selbst geschrieben hat, sind löschbar (Set-Mitgliedschaft + Basename-Sekundärfilter + `path.resolve`-Containment in tmpdir); `send-images` mit Palette+Menu-Sender-Guard; Startup-Sweep nur >1h alte Dateien; Text-Fallback fügt am Caret ein.
- **Fix `0f2efe5` — monotone Clock:** injizierbares `now()` (Default `performance.now()`) für die Cooldown-Deadline, `null`-Sentinel, Fake-Clock-Tests.
- **Re-Review (Kimi k2.6): SHIP** — Lösch-Primitiv geschlossen (keine Set-Injection durch Renderer möglich), Guard vollständig ohne Bruch legitimer Flows, Clock-Migration regressionsfrei. 1 INFO offen: `ownedClipboardTempPaths` wächst bei Paste-ohne-Send unbegrenzt (Cap/Age-Prune optional).
- **Teststand:** 357 pass / 2 skip / 0 fail (+8 Tests); typecheck grün.
- **next_action:** `pulse`-Prop in `NotchWidget` verdrahten, dann P3.6 (History expand/collapse) + P3.1 (Rebindable Hotkey); parallel warten manuelles QA-Gate und Open Questions 4/5 auf den User; danach PR nach `platform/windows/v2-clean` (kein Self-Merge).

### Iteration 6 — P3.4 / P3.5 Review-Cycle (2026-07-10)

Code-Änderungen auf `platform/windows/macos-parity-p1` für den zweiten P3-Slice der macOS-Feature-Parity.

#### 1. P3.4 Clipboard image paste in palette and menu — DONE

- **Commits:** `92f4340` (initial), `161d15a` (polish), `fad3300` (Härtung, unreviewt)
- **Dateien:** `src/renderer/lib/clipboard-image.ts`, `src/renderer/components/PaletteWindow.tsx`, `src/renderer/components/MenuWindow.tsx`, `src/main/session-handlers.ts`, `src/shared/ipc-channels.ts`, `src/renderer/lib/__tests__/clipboard-image.test.ts`, `src/renderer/components/__tests__/PaletteWindow.test.tsx`, `src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** `Ctrl+V` in Palette- und Menu-Compose-Inputs erkennt Bilder per `clipboardData.types`; `save-clipboard-image` IPC schreibt `NativeImage` temporär als PNG und returned den Pfad im `select-images`-Format, sodass `sendImages` dieselben `imageCodec`-Limits anwendet. Härtung in `fad3300`: fail-closed Sender-Guard auf Palette+Menu, `MAX_CLIPBOARD_PIXELS`-Probe vor `toPNG()`, sofortiger Temp-Cleanup nach Send + Startup-Sweep für Leichen.

#### 2. P3.5 Compact avatar entry animation + pulse — DONE

- **Commits:** `baeb687` (initial), `41bd3a2` (mount-only pulse latch), `161d15a` (polish), `fad3300` (Härtung, unreviewt)
- **Dateien:** `src/renderer/components/Avatar.tsx`, `src/renderer/styles/global.css`, `src/renderer/components/__tests__/Avatar.test.tsx`
- **Inhalt:** CSS-only `avatar-slide-in` für jeden frisch gemounteten Avatar; `pulse` prop mount-only via `useState(pulse)` + self-clearing `setTimeout`, damit Re-renders während der `full`-Phase den Ring nicht neu starten. `prefers-reduced-motion: reduce` beachtet. Die Verdrahtung von `pulse` in `NotchWidget.tsx` ist absichtlich noch offen (außerhalb des P3.5-Scopes).

#### Review-Verlauf

- **Erster Review (gegen `161d15a`):** Verdikt **SHIP-mit-Follow-ups**. 4 MAJOR-Findings:
  1. **Clipboard-IPC ohne Sender-Guard:** `save-clipboard-image` akzeptierte von jedem Renderer.
  2. **Clipboard-Encode ohne Size-Limit:** `NativeImage.toPNG()` vor `imageCodec`-Prüfung.
  3. **Temp-Cleanup fehlte:** Temp-Dateien aus Clipboard-Paste wurden nie gelöscht.
  4. **Mouse-Leave-Race:** `setHoverCopy` resettete `active` vor dem Disarm.
- **Härtung:** Commit `fad3300` — fail-closed Sender-Guard für Palette+Menu, `MAX_CLIPBOARD_PIXELS`-Probe vor Encode, Temp-Cleanup nach Send + Startup-Sweep, 300ms-Re-Arm-Cooldown, Latch-Semantik-Bugfix.
- **Status:** `fad3300` ist **noch nicht reviewt** — Review-Scope der nächsten Iteration beginnt bei `161d15a`.

#### Testzahlen

- Nach P3.4 / P3.5: **332 pass / 2 skip / 0 fail**.
- Nach Review-Härtung (Iteration 6, `fad3300`): **349 pass / 2 skip / 0 fail**; `bun run typecheck` grün.

#### Verbleibende Follow-ups

- **MINOR** `pulse` prop in `NotchWidget` verdrahten.
- **INFO** `copyText` setzt `interacted` nicht — Produktentscheidung.
- Manual QA: Clipboard-Bild-Paste in Palette/Menu, Text-Paste unberührt, Oversized-Fehlerpfad.
- Manual QA: Avatar slide-in + pulse visuell.

#### next_action

1. Review von `fad3300`.
2. `pulse`-Verdrahtung + Iteration-5/6-Follow-ups.
3. P3.1/P3.6 implementieren.
4. Manuelles QA-Gate.
5. Open Questions 4/5 klären.
6. PR `platform/windows/macos-parity-p1` → `platform/windows/v2-clean` vorbereiten (kein Self-Merge).

### Iteration 5 — P3.2 / P3.3 / P3.7 Review-Cycle (2026-07-10)

Code-Änderungen auf `platform/windows/macos-parity-p1` für den P3-Slice der macOS-Feature-Parity.

#### 1. P3.2 Hover-"C"-Copy — DONE

- **Commits:** `306063c` (initial), `6b1550e`, `bc24ed5`, `058fc81` (Review-Härtung)
- **Dateien:** `src/renderer/components/NotchWidget.tsx`, `src/main/hover-copy-shortcut.ts`, `src/main/main.ts`, `src/shared/ipc-channels.ts`, `src/renderer/components/__tests__/NotchWidget.test.tsx`, `src/main/__tests__/hover-copy-shortcut.test.ts`
- **Inhalt:** OS-weiter `globalShortcut('C')`, der per `notch-set-hover-copy`-IPC basierend auf Renderer-Hover + Reply-Open-State gearmed/disarmed wird. Kopiert hovered History-Row oder neueste Nachricht. Main-Prozess als Shortcut-Lifecycle-Owner mit 5 Disarm-Pfaden (notch hide, `notch-set-interactive(false)`, `render-process-gone`/`destroyed`, `before-quit`, expliziter Renderer-Disarm), 4s-Idle-Disarm und Register-Fail-Latch.

#### 2. P3.3 Unread-Dot — DONE

- **Commit:** `f914c20`
- **Dateien:** `src/renderer/lib/useNotchLifecycle.ts`, `src/renderer/components/NotchWidget.tsx`, `src/renderer/styles/global.css`, `src/renderer/lib/__tests__/useNotchLifecycle.test.ts`
- **Inhalt:** Blauer Dot im retracted Sliver, wenn eine Nachricht einfährt ohne dass der Nutzer hovered/replied hat; cleared bei Hover/Reply. `interacted` als derived State neben `phase`/`newest`, damit keine Drift entsteht.

#### 3. P3.7 Auto-Update "Check Automatically"-Toggle — DONE

- **Commit:** `43d0966` (initial), `c7ecb4e` (IPC-Plumbing)
- **Dateien:** `src/main/update-service.ts`, `src/main/identity-store.ts`, `src/main/main.ts`, `src/renderer/components/MenuWindow.tsx`, `src/shared/ipc-channels.ts`, `src/main/__tests__/update-service.test.ts`, `src/main/__tests__/identity-store.test.ts`, `src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** Persistenz in `IdentityStore#autoUpdateCheck` (Default `true`), gatet Launch-Check + 24h-Loop; manueller Check bleibt immer erreichbar (Sparkle-Semantik). Sender-guarded IPC, optimistic Toggle mit inFlight-Guard.

#### Review-Verlauf

- **Erster Review:** Verdikt **BLOCK**. 3 CRITICAL-Findings am `globalShortcut`-Lifecycle von P3.2: der OS-weite Shortcut konnte nach stale Hover-Hinweisen systemweit aktiv bleiben und die `C`-Taste bis zum App-Quit blockieren.
- **Härtung:** Variante A (Main-Prozess als Owner) statt Variante B (sichtbarer Copy-Button). Commits:
  - `6b1550e` — Main-Prozess als Shortcut-Lifecycle-Owner, 5 Disarm-Pfade.
  - `bc24ed5` — Renderer zu Hint-Provider + throttled Activity-Ping, 4s-Idle-Disarm.
  - `058fc81` — Register-Fail-Latch, Ref-basierte Copy-Logik, Sender-Guard-Logging.
- **Re-Review:** Verdikt **SHIP-mit-Follow-ups**. Alle 3 CRITICALs bestätigt geschlossen.

#### Testzahlen

- Nach P3.2 / P3.3 / P3.7: **292 pass / 2 skip / 0 fail**.
- Nach Review-Härtung (Iteration 5): **306 pass / 2 skip / 0 fail**; `bun run typecheck` grün.

#### Verbleibende Follow-ups

- **MAJOR Late-Ping-Race:** `setActive(true)` main-seitig nur akzeptieren, wenn Notch sichtbar + interaktiv ist, damit verspätete Pings einen frisch disarmten Shortcut nicht re-armen.
- **MAJOR Idle-Timeout-UX:** "ruhend hovern + C" bricht nach 4s ab — Timeout anheben oder zusätzliches Fokus-/Input-Signal als Aktivitäts-Ping.
- **MINOR** `wireHoverCopyDisarm` — Dispose-Handle für Listener.
- **MINOR** `act`-Warning in `NotchWidget.test.tsx` bereinigen.
- **MINOR** `hoverCopyUnavailable` als sichtbarer UI-State ausführen.
- **INFO** `copyText` setzt `interacted` nicht; Dot bleibt nach Copy bestehen.

#### next_action

1. Follow-ups 1 + 2 aus Iteration 5 angehen.
2. Manuelles QA-Gate durchführen (Autostart, Chip-Row, Notch-Skalierung, P3.2/P3.3/P3.7 Live-Checks).
3. User-Entscheidungen zu Open Questions 4 + 5 einholen.
4. PR `platform/windows/macos-parity-p1` → `platform/windows/v2-clean` öffnen (kein Self-Merge).

### Iteration 2 — P1 Major-Fixes (2026-07-10)

Review-Commits `d63ea90..HEAD` (4 Stück), ausschließlich Review + Doku, keine Code-Änderungen außer Dokumentation.

### Iteration 3 — P1 Review-Härtung (2026-07-10)

Code-Änderungen auf `platform/windows/macos-parity-p1` nach dem ersten adversarialen Review.

#### 1. Generation-Guard gegen out-of-order Resolves — DONE
- **Commit:** `0dcc5e3`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** `updateName()` stempelt jeden Submit mit einer monoton steigenden `nameSaveGenerationRef` und aktualisiert `lastSavedNameRef` nur noch, wenn das Resolve zur neuesten Generation gehört. Spät eintreffende Resolves älterer Calls können den Ref nicht mehr auf einen veralteten Wert setzen.

#### 2. Error-Hint bei fehlgeschlagenem Name-Save — DONE
- **Commit:** `2cad9e0`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** Abgelehntes `updateProfile` zeigt unter dem Display-Name-Input kurzzeitig einen „Saving failed — press Enter to retry"-Hint an. Der Hinweis dismissed automatisch nach ~4 s, sofort bei erneutem Submit oder bei Erfolg. Tests für Anzeige und Dismiss.

#### 3. Synchroner inFlight-Ref gegen Enter+Blur-Doppel-Submit — DONE
- **Commit:** `b2eea7a`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** Ein synchroner `inFlightNameRef` verhindert, dass Enter gefolgt von einem nachfolgenden Blur den gleichen Namen zweimal submittet. Durch den fixen Wert des Refs bleibt der zweite Call idempotent, ohne auf den asynchronen `updateProfile`-Resolve warten zu müssen.

#### Review-Verlauf
- **Erster Review:** Verdikt **BLOCK**. CRITICAL: Enter+Blur-Doppel-Submit war im ersten Testlauf durch synchron wirkende Promise-Mocks verdeckt worden.
- **Fix:** `b2eea7a` eingespielt.
- **Re-Review:** Verdikt **SHIP** mit 2 INFO-Punkten:
  1. Testabdeckung könnte um „Blur mit anderem Namen während in-flight" ergänzt werden.
  2. Theoretisches Hängenbleiben von `inFlightNameRef`, falls `updateProfile` synchron wirft (kein praktisch beobachtetes Szenario, da `updateProfile` immer asynchron ist).
- Beide INFO-Punkte werden als optionale Follow-ups geführt, blockieren den PR nicht.

### Iteration 4 — P2.1 + P2.4 Review-Härtung (2026-07-10)

Code-Änderungen auf `platform/windows/macos-parity-p1` nach dem adversarialen Review von P2.1 (Launch at Login) und P2.4 (Avatar-Chip-Recipient-Picker).

#### 1. Launch at Login opt-in — DONE

- **Commit:** `db3c619`
- **Dateien:** `apps/windows/src/main/login-item.ts`, `apps/windows/src/main/main.ts`, `apps/windows/src/main/identity-store.ts`, `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/shared/ipc-channels.ts`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`, `apps/windows/src/main/__tests__/login-item.test.ts`, `apps/windows/src/main/__tests__/identity-store.test.ts`
- **Inhalt:** Testbares `login-item.ts` wrappt `app.setLoginItemSettings({ openAtLogin })`; Persistenz in `IdentityStore#launchAtLogin` (Default `false`, Migration für Legacy-`state.json`); neue IPC-Kanäle `GET_LAUNCH_AT_LOGIN`/`SET_LAUNCH_AT_LOGIN`; Settings-Popover zeigt persisteden Wert und optimistic Checkbox mit Snap-back bei OS-Fehler.

#### 2. Avatar-Chip-Recipient-Picker — DONE

- **Commit:** `d4b3b5e`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/styles/global.css`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** `RecipientChipRow` ersetzt native `<select>` durch Globe-"All"-Chip plus pro Mitglied einen Avatar+Name-Chip; horizontale Scroll, `title`-Tooltip, `aria-pressed` für Auswahlzustand; unveränderter `onRecipientChange`-Vertrag.

#### Review-Verlauf

- **Erster Review:** 2 MAJOR-Findings + 2 MINOR-Findings.
  - **MAJOR:** `SET_LAUNCH_AT_LOGIN`-IPC in `main.ts` hatte keinen Menu-Sender-Guard — jeder Renderer hätte den Autostart toggeln können.
  - **MAJOR:** Dev-Mode-Skip in `login-item.ts` behandelte `app.isPackaged === false` als Erfolg (Skip = Erfolg), ließ aber `resolve(false)` zurück, sodass der Renderer fälschlich auf unchecked snappte.
  - **MINOR:** Launch-at-Login-Toggle hatte keinen inFlight-Guard — schnelle Klicks konnten Race-Conditions gegen `setLoginItemSettings` erzeugen.
  - **MINOR:** `RecipientChipRow` war als einfache Button-Liste umgesetzt, fehlte `radiogroup`, `roving tabindex` und Pfeiltasten-Navigation.
- **Fix:** `1fd33f2` für die beiden MAJOR-Findings, `da8e294` für die beiden MINOR-Findings.
- **Re-Review:** Verdikt **SHIP-mit-Follow-ups**. Keine Blocker.

#### Testzahlen

- Nach P2.1 + P2.4: **247 pass / 2 skip / 0 fail**.
- Nach Review-Härtung (Iteration 4): **259 pass / 2 skip / 0 fail**; `bun run typecheck` grün.

#### Offene Entscheidungen / QA

- **Open Question 4 (Lightbox-Verhalten):** Soll ein Klick auf ein Notch-Thumbnail eine Lightbox innerhalb der Notch, ein eigenes always-on-top-Fenster oder den System-Viewer öffnen?
- **Open Question 5 (CLI-Distributionsmodell):** Soll der Windows-Client den CLI als `extraResource` bundlen und per Menü-Eintrag installieren (P2.2), oder bleibt der CLI ein separates Installationsartefakt?
- **Manuelles QA-Gate vor dem PR:**
  - Packaged-Build-Autostart für P2.1 (Log-out/-in, Windows-Startup-Apps-Einstellung spiegelt Checkbox wider).
  - Chip-Row Screenreader/Tastatur für P2.4 (Fokus, Pfeiltasten, Auswahl ankündigen).
  - Notch bei 100 % / 125 % / 150 % Display-Skalierung (P1.3).
  - Retry nach simuliertem Relay-Offline im laufenden App (P1.2).

#### 1. Display-name Retry nach fehlgeschlagenem `updateProfile` — DONE
- **Commit:** `3f07edb`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** `updateName()` committed `lastSavedNameRef` jetzt erst in `updateProfile(name).then(...)`. Bei Rejection bleibt der Ref auf dem zuletzt erfolgreich gespeicherten Namen, sodass Retry mit demselben Text nicht mehr als "unchanged" verworfen wird. Regressionstest un-skipped.

#### 2. Notch-Resize-Debounce und 1px-Toleranz — DONE
- **Commit:** `70bff3a`
- **Dateien:** `apps/windows/src/main/notch-window.ts`, `apps/windows/src/main/__tests__/notch-window.test.ts`, `apps/windows/src/renderer/components/NotchWidget.tsx`, `apps/windows/src/renderer/components/__tests__/NotchWidget.test.tsx`
- **Inhalt:** Renderer-`ResizeObserver` debounced um 80 ms; `resizeNotchToContent` ignoriert Höhenänderungen ≤ ±1 px, um Display-Scaling-Rounding-Oszillationen (125 %/150 %) zu unterbinden. Timer-Cleanup im Unmount-Effekt vorhanden.

#### 3. Globales `color-scheme: dark` für native Dropdowns — DONE
- **Commit:** `433ba2c`
- **Dateien:** `apps/windows/src/renderer/styles/global.css`, `apps/windows/src/renderer/styles/__tests__/global.css.test.ts`
- **Inhalt:** `color-scheme: dark` auf `:root`, damit Chromium native Popups (u. a. `<select>`-Liste) dunkel rendert, unabhängig vom OS-Theme. Bestehende `.frosted-field option`-Regel bleibt Fallback.

#### 4. Cleanup / Plan-Branch-Korrektur — DONE
- **Commit:** `0a1184b`
- **Dateien:** `apps/windows/src/renderer/components/NotchWidget.tsx`, `apps/windows/docs/plans/12-macos-feature-parity.md`
- **Inhalt:** Ungenutzte `expanded`-Variable inline ersetzt (`!(reopening || replyOpen)`), Plan 12 Branch-Name korrigiert, drei MAJOR-Follow-ups als resolved markiert.

### 1. P1.1 Dropdown white-on-white fix — DONE
- **Commit:** `7f673bc`
- **Dateien:** `apps/windows/src/renderer/styles/global.css`, `apps/windows/src/renderer/styles/__tests__/global.css.test.ts`
- **Inhalt:** `.frosted-field option { background-color: #1c1c1e; color: var(--munkel-text) }` gepinnt, CSS-Test prüft Regel + nicht-weißen Hintergrund.

### 2. P1.2 Display-name Enter commit — DONE
- **Commit:** `c593e54`
- **Dateien:** `apps/windows/src/renderer/components/MenuWindow.tsx`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`
- **Inhalt:** `commitNameOnEnter` verhindert Default, ruft `updateName()` und blurrt das Input; `lastSavedNameRef` macht Enter + nachfolgenden Blur idempotent; unveränderter/whitespace-only Name wird nicht gesendet.

### 3. P1.3 Notch compact + dynamic resize — DONE
- **Commit:** `4e4c329`
- **Dateien:** `apps/windows/src/main/notch-window.ts`, `apps/windows/src/main/main.ts`, `apps/windows/src/renderer/components/NotchWidget.tsx`, `apps/windows/src/renderer/styles/global.css`, `apps/windows/src/main/preload.ts`, `apps/windows/src/shared/ipc-channels.ts`, `apps/windows/src/shared/types.ts`
- **Inhalt:** Breite 360→280 px, `min-height:100%` entfernt, `ResizeObserver` in `NotchWidget` reported `offsetHeight` via `notch-resize` IPC, Main resizes Fenster clamped [40, 480], Sender-Guard auf `notchWindow`.

### 4. P1.4 Doc-Sync — DONE
- **Commit:** `135457e`
- **Dateien:** `apps/windows/docs/plans/12-macos-feature-parity.md`, `apps/windows/docs/plans/README.md`, `docs/bugs/windows-notch-ux-2026-06-30.md`
- **Inhalt:** Plan 12 P1 als done markiert, Bug-Doc korrigiert (WIN-NOTCH-001 "fixed 2026-07-04" war falsch, tatsächlicher Fix 2026-07-10).

### 5. Test-Härtung — DONE
- **Commit:** `77d32c5`
- **Dateien:** `apps/windows/src/main/__tests__/notch-window.test.ts`, `apps/windows/src/renderer/components/__tests__/MenuWindow.test.tsx`, `apps/windows/src/renderer/components/__tests__/NotchWidget.test.tsx`, `apps/windows/docs/plans/12-macos-feature-parity.md`
- **Inhalt:** Clamp-Boundary-Tests, NaN/negative-Input-Tests, ResizeObserver-Wiring-Tests, Enter/Blur/Whitespace-Tests, dokumentierter `it.skip`-Regressionstest für den updateName-Retry-Bug.

## remaining (optional / QA)

- **Optionale Follow-ups** (INFO aus Re-Review, kein Blocker):
  1. Testabdeckung in `MenuWindow.test.tsx` um „Blur mit anderem Namen während ein anderer Name in-flight ist" ergänzen.
  2. `inFlightNameRef`-Reset-Verhalten überprüfen, falls `updateProfile` jemals synchron wirft (theoretisch, aktuell nicht beobachtbar).
- **Manuelles QA-Gate** vor dem PR:
  - Retry nach simuliertem Relay-Offline im laufenden App.
  - Error-Hint-Optik und 4s-Auto-Dismiss.
  - Notch bei 100 % / 125 % / 150 % Display-Skalierung.
  - Dropdown-Farben im Light-Theme-Windows.

## blockers

- **Keine harten Blocker.** Beide MAJOR-Findings aus Iteration 2 wurden in Iteration 3 behoben (Commits `0dcc5e3`, `2cad9e0`, `b2eea7a`).
- Offen ist nur das manuelle QA-Gate.

## next_action

1. `pulse`-Verdrahtung in `NotchWidget` + verbleibende Iteration-5/6-Follow-ups.
2. P3.6 (History expand/collapse) und P3.1 (Rebindable global hotkey UI) implementieren.
3. Manuelles QA-Gate durchführen und Ergebnisse in Plan 12 / STATE.md eintragen.
4. User-Entscheidungen zu Open Questions 4 + 5 einholen.
5. PR `platform/windows/macos-parity-p1` → `platform/windows/v2-clean` öffnen; erst nach Review + grünem CI mergen (kein Self-Merge).

---

# Handoff — munkel (2026-07-05)

[Previous handoff content preserved below]

## current_state

- **Aktueller Branch:** `platform/windows/v2-clean` (Tip: `2ea72ec`).
- **Working directory:** Das ursprüngliche Verzeichnis `C:/Users/rodgi/OneDrive/Documents/CODING/Test/munkel` ist leer/gesperrt (OneDrive- oder Prozess-Lock nach `bun run pack:installer` im Auto-Update-Task). Die aktuelle Arbeitskopie befindet sich in `C:/Users/rodgi/OneDrive/Documents/CODING/Test/munkel-recovery`.
- **Session pausiert** auf User-Anweisung (`/fp-pause`).

## completed in dieser Session (offene Tasks 1–3 von 5)

### 1. Circle-Leave-Bestätigungsdialog — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/circle-leave-confirmation`
- **PR:** #38 → Merge-Commit `803f0fc` in `platform/windows/v2-clean`
- **Tag:** `feat/windows-circle-leave-confirmation`
- **Inhalt:** Frosted Mini-Popup vor dem Verlassen eines Circles, Cancel/Escape/Backdrop-Dismissal, Fokus-Trap, ARIA-Attribute, 278 Zeilen neue `MenuWindow`-Tests.
- **Doku:** `apps/windows/docs/plans/09-circle-leave-confirmation.md`, `apps/windows/docs/plans/README.md`, `apps/windows/README.md`, `docs/README.md` aktualisiert.
- **Verifikation:** 178 pass / 2 skip / 0 fail; typecheck + build green; CI green.

### 2. Logo-Assets-Pipeline — DONE (placeholder), gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/logo-assets-integration`
- **PR:** #39 → Merge-Commit `7787cc0` in `platform/windows/v2-clean`
- **Tag:** `feat/windows-logo-assets-pipeline`
- **Inhalt:** Kanonische `apps/windows/assets/logo.svg`, `render-ico` + `render-tray-icon` rendern daraus, neue `tray-icon-24.png`, Tray-Resolution-Chain 32→24→16, deterministic, alles committed.
- **Wichtig:** Es existieren weiterhin keine offiziellen Brand-Assets; `logo.svg` ist ein klar kommentierter Placeholder. Status in `docs/README.md` daher "Partially done".
- **Doku:** Plan 10, `apps/windows/README.md`, `docs/README.md`, `apps/windows/docs/plans/README.md` aktualisiert.
- **Verifikation:** typecheck, tests, build, `pack:dir` + ICO-Ressourcen-Check green; CI green.

### 3. Auto-Update (electron-updater) — DONE, gemerged, getaggt, Branch gelöscht
- **Branch:** `platform/windows/auto-update`
- **PR:** #40 → Merge-Commit `92b06f4` in `platform/windows/v2-clean`
- **Zusätzlicher Fix-Commit auf dem Branch:** `26bb5bb` (Vite-External `electron-updater`, Race-Condition-Guards, Error-Sanitization, Release-Workflow-Independence, mehr Tests)
- **Tag:** `feat/windows-auto-update`
- **Inhalt:** `electron-updater` mit GitHub-Releases-Feed (`rodgi040/munkel`), Auto-Check beim Start + alle 24h, manueller "Check for Updates…"-Trigger, Renderer-Status-Pill, Tray-Menü-Eintrag, IPC-Erweiterung, Unit-Tests für Update-Service + MenuWindow, CI-Smoke-Test `pack:installer`, Windows-Release-Job in `release.yml`.
- **Sicherheit:** `verifyUpdateCodeSignature: false` für unsigned Beta mit TODO, Error-Messages gesäubert, keine sensitiven Pfade/UI.
- **Doku:** Plan 11, `apps/windows/docs/ipc-contract.md`, `apps/windows/README.md`, `docs/README.md` aktualisiert.
- **Verifikation:** 195 pass / 2 skip / 0 fail; typecheck + build + `pack:installer` (inkl. `latest.yml`) green; CI green.

## remaining (offene Tasks 4–5)

### 4. NSIS-Installer an `main` übergeben — IN PROGRESS / PAUSIERT
- **Status:** NSIS-Installer mit Start-Menü-Shortcuts ist bereits in `platform/windows/v2-clean` (PR #25). Der finale PR nach `main` ist noch ein Draft.
- **AGENTS.md:** `main` darf nur einmal am Ende via manuell reviewed PR erreicht werden.
- **Nächster Schritt:** Plan-Agent für Handover-Vorbereitung starten, Diff `v2-clean` ↔ `main` analysieren, Draft-PR prüfen/aktualisieren, Handover-Checkliste erstellen. Kein autonomer Merge nach `main`.

### 5. Manuelle QA-Gates dokumentieren — PENDING
- **Circle Presence 2-Personen-Visueller-Check**
- **Menü click-away dismiss**
- **Notch auto-hide/retract**
- **Nächster Schritt:** Strukturierte QA-Testpläne/Checklisten in der Dokumentation anlegen.

## offene Pull Requests

- Keine eigenen Feature-PRs mehr offen (alle gemerged).
- Der PR von `platform/windows/v2-clean` nach `main` ist laut `docs/README.md` ein Draft (menschlicher End-PR).

## tags dieser Session

- `feat/windows-circle-leave-confirmation`
- `feat/windows-logo-assets-pipeline`
- `feat/windows-auto-update`

## branches dieser Session (remote gelöscht)

- `platform/windows/circle-leave-confirmation`
- `platform/windows/logo-assets-integration`
- `platform/windows/auto-update`

## blockers

- **Working-directory-Recovery:** `C:/Users/rodgi/OneDrive/Documents/CODING/Test/munkel` ist leer/gesperrt. Eine Wiederherstellung (Reboot/OneDrive-Resync) oder dauerhafte Nutzung von `munkel-recovery` ist nötig.

## next_action

1. Neues Verzeichnis/Session vorbereiten.
2. Task 4 (NSIS-Handover) mit Plan-Agent starten.
3. Task 5 (QA-Gates-Doku) abschließen.

---

# Handoff — munkel (2026-07-03)

## current_state

- **Aktueller Branch:** `platform/windows/v2-clean` (enthält den Single-Instance-Fix via Merge `50998af`).
- **Working-Tree:** `IDEAS.md` + `apps/windows/docs/plans/README.md` sind **modifiziert/gestaged, aber NICHT committet** (fp-note-Notizen — bewusst uncommitted). Untracked Streu-Dateien: `HANDOFF.md`, `docs/README.md`, `docs/audits/`, `docs/bugs/`, `untitled.pen`.
- **Dev-Server läuft** (~13 `electron.exe` + node): die Launcher-Test-Instanz vom Self-Heal-Test ist noch aktiv. Stoppen: App via Tray→Quit + minimiertes Konsolenfenster schließen, oder `Get-Process electron | Stop-Process -Force` + den `dev.mjs`-node-Prozess killen.
- **Zwei Feature-Stränge dieser Session-Kette:**
  1. **Single-Instance/Self-Heal** — KOMPLETT DURCH: PR #23 gemerged, getaggt, Branch gelöscht. ✅
  2. **Notch Peek/History** — PR #22 (`platform/windows/notch-peek-history`) **noch OFFEN**, QA unvollständig (siehe remaining).

## completed (diese Session)

### 1. Single-Instance-Lock + Self-Heal (Windows) — DONE, gemerged, getaggt
- **Root-Cause belegt** (Codex gpt-5.5, Report `scratchpad/wm-circle-drop-analysis.md`): Circle „wm" ging offline, weil **zwei Munkel-Prozesse** (Dev + alter installierter Build 28.06.) mit **derselben `memberId 602a0e2c…`** liefen → gegenseitige Relay-Verdrängung (`core/protocol.ts:14-18`: neue Verbindung gleicher memberId ersetzt alte still) → Flapping `close-1006→reconnect→open`.
- **Windows-Recherche belegt:** Electron-Lock keyt auf den **`userData`-Pfad** (Message-Window-Titel, case-insensitiv), NICHT auf appId/AppUserModelId. `%APPDATA%\munkel` == `%APPDATA%\Munkel` = derselbe Lock. Footgun = nicht-triviale Namens-/userData-Abweichung.
- **Fix** (`apps/windows/src/main/main.ts`, Modul-Kopf VOR `requestSingleInstanceLock`): `setName('munkel')` → `fs.mkdirSync(pinnedUserData,{recursive:true})` → `setPath('userData', %APPDATA%\munkel)` → `setAppUserModelId('app.munkel.windows')`; plus `second-instance`-Handler (null/destroyed-safe, `createMenuWindow`-Recreate, `showMenuWindow` restore/show/focus, KEIN alwaysOnTop-Toggle). `menu-window.ts`: neuer Helper `showMenuWindow()`.
- **Orchestriert:** Plan → Codex-Plan-Review (fand `pack:dir`-Blocker + `setPath`-Throw-Risiko + alwaysOnTop-Regression) → Codex-Umsetzung → Sonnet-Review „SHIP".
- **Empirisch getestet (bestanden):** zweite Instanz → sofortiger Self-Exit (EXITCODE 0, keine Relay-Verbindung), weiterhin genau 1 Instanz (6 electron.exe), **kein** wm-Flapping. User bestätigt „wm funktioniert wieder".
- **Verifikation:** `bun run typecheck` clean, `bun test` 142 pass / 2 skip / 0 fail.
- **Merge/Tag/Branch:** PR #23 → Merge-Commit `50998af` in `v2-clean`; annotated Tag `fix/windows-single-instance-selfheal` auf den Merge-Commit (gepusht); Branch `platform/windows/single-instance-selfheal` **remote + lokal gelöscht**.

### 2. Alter installierter Build entfernt
- `%LOCALAPPDATA%\Programs\@munkelwindows\Munkel.exe` (Build 28.06.) hatte einen **echten NSIS-Uninstaller + Registry-Eintrag „Munkel 0.0.1"** — Provenienz unklar (keine NSIS-Config im Repo, nur `zip`/`dir`). **Vor** dem Deinstallieren `state.json` gesichert (`scratchpad/munkel-store-backup/state.json.bak`). Offizieller Uninstaller silent gelaufen → Ordner/Exe/Start-Menü-Shortcut/Registry weg; **Store `%APPDATA%\munkel` (wm+espresso) blieb intakt** (verifiziert).

### 3. Dev-Launcher + Windows-Start-Menü-Verknüpfung
- `apps/windows/scripts/launch-munkel-dev.cmd` (committet in PR #23, `f89ddf8`): portabler Launcher, startet `bun run dev` (mit `where bun`-Fallback auf `%USERPROFILE%\.bun\bin\bun.exe`).
- Start-Menü-Verknüpfung `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Munkel.lnk` → Launcher, Icon `assets/icon.ico`, minimierte Konsole. „Munkel" ist über die Windows-Suche startbar → immer der **aktuelle Dev-Stand** (kein Paket-Build). End-to-end getestet (App bootet über den Launcher).

### 4. Notch Peek/History (PR #22) — implementiert, aber QA offen
- Feature umgesetzt (5s FULL → 30s PEEK+weißer Reverse-Ring → RETRACTED → Hover-Reopen → 60s-History-Liste), Codex-Umsetzung + Sonnet „SHIP", PR #22 offen gegen `v2-clean`, Branch `platform/windows/notch-peek-history` (zuletzt `0a3f942`). **QA unvollständig** — volle Animation noch nicht live gesehen; User meldet: Auto-Ausblend-/Einfahr-Sequenz greift noch nicht („Nachrichten verschwinden nicht").

### 5. Memory + IDEAS
- Memory `munkel-dev-is-release` angelegt (Dev = einzige Version, Release = Dev 1:1, keine Prod/Installer-Linie).
- IDEAS.md ergänzt (uncommitted): Menüfenster-Klick-außerhalb-Bug, Notch-Retract-Sequenz-Bug, wm-Root-Cause, installierte-Circles. Stash-Pop-Konflikt beim Branch-Aufräumen sauber aufgelöst (nichts verloren).

## remaining (in Reihenfolge)

1. **Menüfenster schließt nicht per Klick-außerhalb** (neuer Bug, `apps/windows/src/main/menu-window.ts`): großes Menüfenster bleibt dauerhaft offen; Soll = `blur`/Fokusverlust → hide (click-away-to-dismiss). Wahrscheinlich fehlender `blur`→hide-Handler am `alwaysOnTop:true`-Fenster.
2. **Notch „Nachrichten verschwinden nicht"** (`NotchWidget.tsx` + `notch-window.ts`): Auto-Ausblend-/Einfahr-Sequenz greift noch nicht (obwohl laut PR-#22-Plan abgearbeitet). Blockiert die volle Notch-QA.
3. **Notch-QA gesamt** (PR #22): volle Animation live mit einer echten Nachricht (CLI `munkel send <code> <text>` oder Peer) verifizieren; Hover-Reopen unter `setIgnoreMouseEvents(forward:true)` auf Windows prüfen (sonst `notch-reopen`-Cursor-Polling-Fallback). Danach **PR #22 mergen** (Merge-Commit + Tag + Branch schließen, wie bei #23).
4. Optional: fehlenden „munkel"-Circle (lag nur im alten `%APPDATA%\Electron`-Store auf totem `ws://127.0.0.1:8787`) auf Prod-Relay neu joinen, ODER `Electron`-Store bewusst löschen.
5. Entscheiden, ob die uncommitteten IDEAS.md-fp-note-Notizen auf `v2-clean` committet werden sollen.

## decisions (verbatim Rationale)

- **„aus den vorhandenen App-Development-Ressourcen beide Instanzen zu einer mergen … wenn ich eine neue Instanz starte, dass diese sich selbst heilt und nicht zwei Instanzen parallel laufen"** → eine App-Identität, robuster Lock + Self-Heal-Fokus-Handler; **kein** Dev-Profil-Override.
- **„vorerst nur die Development-Version … für den Release werden wir dann auch einfach 1:1 die Development Version pushen … keine Production Version benötigt"** → Shortcut startet `bun run dev` (immer aktueller Source), NICHT einen Paket-Build; kein NSIS/Installer in diesem Scope. (→ Memory `munkel-dev-is-release`.)
- **Alt-Build entfernen (Variante B, Pro/Contra vom User delegiert):** erst reversibel neutralisieren (Store-Backup) → offizieller Uninstaller; sauberes Testumfeld > Abhängigkeit vom nicht-100%-verstandenen Lock-Verhalten.
- **`setPath('userData')` ist Härtung, nicht der funktionale Bugfix** (den erledigt schon `setName`); explizit gepinnt entkoppelt den Lock vom Namens-Default. Keine Migration (Pfad identisch).
- **Empirische Verifikation Pflicht**, weil der exakte Grund des Lock-Versagens beim Alt-Build nicht 100% bewiesen ist.
- **fp-note-Notizen NICHT committen** (Konvention: nur notieren).
- **Git-Konvention (unverändert):** kein FF, Merge-Commit via PR, annotated Tag, Branch löschen. PRs im **Fork** `rodgi040/munkel` (NICHT Upstream `limehq/munkel` — `gh` löst per Default auf Upstream auf → immer `-R rodgi040/munkel`), base `platform/windows/v2-clean` (Vollname).

## blockers

- Keine harten Blocker. **Abhängigkeit:** PR #22 (Notch) sollte erst gemerged werden, wenn die „Nachrichten verschwinden nicht"-Sequenz gefixt + QA bestanden ist.

## next_action

Mit dem User klären, welcher offene Bug zuerst: **Empfehlung — Menüfenster-Klick-außerhalb-Bug** (`menu-window.ts`, `blur`→hide-Handler; klein & standalone, unabhängig von PR #22). Alternativ die Notch-„Nachrichten verschwinden nicht"-Sequenz (Voraussetzung für PR-#22-Merge).
