# Munkel Codebase-Scan: Findings-Tabelle

**Datum:** 2026-07-07  
**Scope:** `apps/cli`, `apps/macos`, `apps/server`, `apps/windows`, `packages/shared-wire`  
**Methode:** AgentSwarm-Review (5 parallele Read-Only-Reviews nach Bereich)

---

## Legende

| Bewertung | Bedeutung |
|-----------|-----------|
| 🔴 Kritisch | Sicherheitsrisiko, Datenverlust oder stabiler Bug; sofort beheben |
| 🟡 Warnung | Inkonsistenz, fehlende Robustheit oder erhöhtes Bug-Potenzial; bald angehen |
| 🟢 Info | Wartbarkeit, Duplikation oder kleinere Verbesserung |

---

## Findings

| # | Bereich | Ort | Finding | Erläuterung | Bewertung |
|---|---------|-----|---------|-------------|-----------|
| 1 | IPC / shared-wire | `packages/shared-wire/src/transport.ts:39-91` | Unbegrenzter Zeilenpuffer im Control-Server | Client ohne `\n` lässt Puffer unbegrenzt wachsen → Speicherüberlastung | 🔴 |
| 2 | IPC / shared-wire | `packages/shared-wire/src/transport.ts:107-155` | `ControlClient.close()` ist No-Op | In-Flight-Requests können nicht abgebrochen werden; kein Timeout | 🔴 |
| 3 | Windows / Sicherheit | `apps/windows/src/main/session-handlers.ts:19-20` → `group-session.ts:167-176` | Renderer kann beliebige Pfade zum Upload zwingen | `send-images` liest `paths` aus dem Renderer ohne Validierung | 🔴 |
| 4 | Windows / Sicherheit | `apps/windows/src/main/session-handlers.ts:54-58` → `core/blob-upload.ts` | `r2Key` unvalidiert in URL interpoliert | Pfad-Traversal auf Relay-Origin möglich | 🔴 |
| 5 | Windows / Sicherheit | `apps/windows/src/main/session-handlers.ts:7-58` | IPC-Handler casten Argumente blind | Falscher Typ führt zu `TypeError` im Main-Prozess | 🔴 |
| 6 | Windows / Stabilität | `apps/windows/src/core/image-codec.ts:92-120` | Browser-APIs im Main-Prozess | `createImageBitmap`/`OffscreenCanvas` in Node/Bun `undefined` | 🔴 |
| 7 | Windows / Renderer | `apps/windows/src/renderer/components/NotchWidget.tsx:132-153` | Race im Image-Preview | Schnelles Wechseln zeigt veraltetes Bild | 🔴 |
| 8 | Windows / Race | `apps/windows/src/main/session-store.ts:43-74` | Race bei `joinCircle` | Parallele Aufrufe für denselben Code erzeugen doppelte Sessions | 🟡 |
| 9 | Windows / Race | `apps/windows/src/main/session-store.ts:168-177` | `setRelayUrl` persistiert vor erfolgreichem Connect | Schlechte URL wird gespeichert, bevor Verbindung steht | 🟡 |
| 10 | Windows / Speicher | `apps/windows/src/main/group-session.ts:60, 376` | `receivedImages` wächst unbegrenzt | Jede empfangene Bild-UUID bleibt für immer in der Map | 🟡 |
| 11 | Windows / Netzwerk | `apps/windows/src/main/relay-client.ts:169-173` | Kein Ping/Pong-Timeout | Half-Open-Sockets werden nie erkannt | 🟡 |
| 12 | Windows / Speicher | `apps/windows/src/renderer/components/NotchWidget.tsx:26` | `fullImageCache` unbegrenzt | Viele Bildvorschauen blasen Speicher auf | 🟡 |
| 13 | Windows / UI | `apps/windows/src/renderer/components/NotchWidget.tsx:144-152` | `fetchFullImage`-Rejection unbehandelt | Unhandled rejection bei Fehler | 🟡 |
| 14 | Windows / UI | `apps/windows/src/renderer/components/NotchWidget.tsx:349-371` | Preview-Overlay ohne Fokus-Trap/ARIA | Tastaturnutzer können aus dem Dialog heraus tabben | 🟡 |
| 15 | Windows / UI | `apps/windows/src/renderer/components/NotchWidget.tsx:83-89` | Reply-Text wird bei jeder Nachricht gelöscht | Datenverlust während des Tippens | 🟡 |
| 16 | Windows / Sicherheit | `apps/windows/src/renderer/components/MenuWindow.tsx:43-48` | `rollCode` nutzt `Math.random()` | Nicht-kryptographischer Code-Vorschlag | 🟡 |
| 17 | Windows / Sicherheit | `apps/windows/src/renderer/components/Avatar.tsx:69-72` | Avatar immer als `image/jpeg` gerendert | PNG/AVIF-Avatare werden möglicherweise falsch dargestellt | 🟡 |
| 18 | Windows / Sicherheit | `apps/windows/src/renderer/components/Avatar.tsx:54-72` | Externe Avatar-URLs unverändert gerendert | Tracking/SSRF-Risiko | 🟡 |
| 19 | shared-wire | `packages/shared-wire/src/payload.ts:146-152` | `assertPayloadFits` zählt Zeichen statt Bytes | Multi-Byte-UTF-8 unterläuft Relay-Limit | 🟡 |
| 20 | shared-wire | `packages/shared-wire/src/crypto.ts:160` | `TextDecoder` ohne `fatal: true` | Ungültiges UTF-8 wird still ersetzt | 🟡 |
| 21 | shared-wire | `packages/shared-wire/src/transport.ts:48-70` | Keine Socket-Timeouts | Half-Open-Verbindungen persistieren | 🟡 |
| 22 | shared-wire | `packages/shared-wire/src/transport.ts:58, 130` | Keine Runtime-Validierung von Control-Frames | `as ControlRequest`/`as ControlResponse` ohne Schema | 🟡 |
| 23 | Windows / core | `apps/windows/src/core/image-codec.ts:57-69` | WASM-Init race + keine Retry | Doppelte Inits, permanenter Fehler nach einmaligem Reject | 🟡 |
| 24 | Windows / core | `apps/windows/src/core/image-codec.ts:140-186` | Keine Input-Size-Limits vor Decode | Decompressions-Bombe / OOM möglich | 🟡 |
| 25 | Windows / core | `apps/windows/src/core/blob-upload.ts:68-159` | Keine `fetch`-Timeouts | Upload/Download können unendlich hängen | 🟡 |
| 26 | Windows / core | `apps/windows/src/core/github-device-auth.ts:62-86` | `interval` von GitHub nicht lower-bounded | `interval: 0` führt zu tight poll loop | 🟡 |
| 27 | Windows / main | `apps/windows/src/main/main.ts:113-242` | Kein top-level Error-Handling beim Startup | Unhandled rejection kann App halb-initialisieren | 🟡 |
| 28 | Windows / main | `apps/windows/src/main/broadcast-state.ts:16-18` | `webContents.send()` ohne destroyed-Check | Zerstörtes Fenster wirft und bricht Broadcast ab | 🟡 |
| 29 | Windows / main | `apps/windows/src/main/menu-window.ts:83-91`, `palette-window.ts`, `notch-window.ts` | Window-Helpers ohne `isDestroyed()`-Checks | Zerstörte Fenster führen zu Throws | 🟡 |
| 30 | CLI | `apps/cli/src/munkel.ts:228-273, 361` | Globale `firstLine`-Promise | Retry wartet auf Response der ersten Verbindung | 🟡 |
| 31 | CLI | `apps/cli/src/munkel.ts:322-339` | `waitForTransport` leakt Probe-Sockets | Sockets werden nie geschlossen | 🟡 |
| 32 | Server | `apps/server/src/group-room.ts:65` | `onConnect` überschreibt Alarm blind | Neuer Connect verschiebt sauberen Cleanup hinaus | 🟡 |
| 33 | Server | `apps/server/src/blob.ts:66-77` | Blob-Upload ohne Streaming-Limit | Fehlender `Content-Length` → Speicherüberlastung | 🟡 |
| 34 | macOS | `apps/macos/Sources/MunkelApp/AppModel.swift:350-355` | Bild-Uploads lesen beliebige Dateien | Keine Validierung von `imagePaths` | 🟡 |
| 35 | macOS | `apps/macos/Sources/MunkelApp/GroupSession.swift:261-289` | Eingehende Bilder nicht vollständig validiert | `r2Key`, Dimensionen werden ungeprüft weitergegeben | 🟡 |
| 36 | macOS | `apps/macos/Sources/MunkelApp/MenuView.swift:167,192,...` | `.help()`-Tooltips in capture-excluded UI | Tooltips können trotz Screen-Capture-Exclusion leak | 🟡 |
| 37 | macOS | `apps/macos/Sources/MunkelApp/CaptureExclusion.swift:60-69` | Notification-Observer wird nie entfernt | Dangling pointer möglich | 🟡 |
| 38 | macOS | `apps/macos/Sources/MunkelApp/MenuView.swift:461-465`, `CommandPalettePresenter.swift:95-99` | Staged images ohne Byte-Budget | Große Bilder vor Transcode im Speicher | 🟡 |
| 39 | Windows / Wartbarkeit | `apps/windows/src/main/main.ts` | `main.ts` überladen | ~237 Zeilen Lifecycle/IPC/State/Updates/Login | 🟢 |
| 40 | Windows / Wartbarkeit | `apps/windows/src/renderer/lib/useNotchLifecycle.ts` | Viele gekoppelte `useEffect` | Sechs Effects für Timer/History/Hover | 🟢 |
| 41 | Windows / Wartbarkeit | `apps/windows/src/main/group-session.ts` | `handleFrame` zu lang | Eine Methode für alle Frame-Typen | 🟢 |
| 42 | Windows / Wartbarkeit | `packages/shared-wire/src/payload.ts` | `encodeProfile` mit fragiler Überladung | Laufzeit-Check positional vs options object | 🟢 |
| 43 | Windows / Testabdeckung | `apps/windows/src/renderer` | Keine Tests für `NotchWidget`, `PaletteWindow`, `Avatar` | Komplexe neue Funktionen ungetestet | 🟢 |
| 44 | shared-wire | `packages/shared-wire/src/payload.ts:207-219` | Decoder droppt Extra-Bilder statt zu validieren | `encodeImage` clamped nicht, Kommentar stimmt nicht | 🟢 |
| 45 | shared-wire | `packages/shared-wire/src/normalize.ts:6-12` | `normalizeCircleCode` wirft generischen `Error` | Rest des Pakets nutzt Domain-Errors | 🟢 |
| 46 | shared-wire | `packages/shared-wire/src/protocol.ts` | `ServerMessage` TypeScript-only | Keine Runtime-Schema-Validierung | 🟢 |
| 47 | macOS | `apps/macos/Sources/MunkelApp/NotchPresenter.swift:141-153` | Offener Reply blockiert neue Nachrichten | `display()` wartet in `while current.replying` | 🟢 |
| 48 | macOS | `apps/macos/Sources/MunkelApp/CLIInstaller.swift:65-78` | Shell-PATH-Update ignoriert Fish | Nur `.bash_profile` / `.zshrc` | 🟢 |
| 49 | Tooling | `scripts/build-appcast.sh:43-45` | Sparkle-Tarball ohne Checksum | MITM-Risiko beim Download des Sign-Tools | 🟢 |

---

## Kurzbeurteilung

| Bereich | Zustand | Hauptprobleme |
|---------|---------|---------------|
| Krypto | ✅ solide | AES-256-GCM, HKDF, Nonce-Handling korrekt |
| Lokale IPC | 🔴 problematisch | Unbegrenzte Puffer, No-Op-Close, keine DACL |
| Windows-Client | 🔴/🟡 kritisch bis verbesserungswürdig | IPC-Trust-Gaps, Browser-APIs im Main, Races |
| macOS-Client | 🟡 gut, aber Drift | Bildvalidierung, Capture-Exclusion-Edge-Cases |
| Server | 🟡 robust, aber ungeschützt | Kein Rate-Limit, Blob-Upload ohne Stream-Cap |
| Protokoll/Shared-Wire | 🟡 Inkonsistenzen | Zeichen- statt Byte-Check, fehlende Runtime-Validierung |
| Architektur | 🟢 funktional | `main.ts` überladen, viele Magic Numbers |
