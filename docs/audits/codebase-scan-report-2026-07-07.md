# Codebase-Scan: Munkel – Schwächen, Fehler & Over-Engineering

**Datum:** 2026-07-07  
**Scope:** `apps/cli`, `apps/macos`, `apps/server`, `apps/windows`, `packages/shared-wire`  
**Methode:** AgentSwarm mit fünf parallelen Read-Only-Reviews nach Bereich (`shared-wire`, `windows/main`, `windows/core`, `windows/renderer`, `server/cli/macos/scripts`).  
**Ausgeschlossen:** Build-Ausgaben (`dist/`, `.build/`, `.wrangler/tmp/`), `node_modules`, nicht-source Dateien.

---

## Executive Summary

Die Codebase ist für einen Cross-Platform-Messenger mit Fokus auf Ephemerität gut strukturiert. Die kryptografischen Grundlagen (AES-256-GCM, HKDF-SHA256, zufällige Nonces) sind korrekt und plattformübergreifend konsistent.

Die größten aktuellen Risiken liegen außerhalb der Krypto:

1. **Lokale IPC ist unsicher und racy.** Unbegrenzte Puffer, fehlende Timeouts und ein No-Op-`close()` im Control-Client.
2. **Windows-Trust-Boundary-Lücken.** Der Renderer kann über IPC beliebige Dateien lesen und URL-Pfade manipulieren.
3. **Browser-APIs im Electron-Main-Prozess.** `createImageBitmap`/`OffscreenCanvas` sind dort nicht verfügbar.
4. **Race Conditions und unbegrenzter Speicher.** `joinCircle`, `receivedImages`, `fullImageCache`.
5. **Renderer-UX/Sicherheit.** Image-Preview-Race, fehlende Fokus-Traps, `Math.random()` für Circle-Codes.

Empfohlener nächster Schritt: P0#11 (`sendImages` parallelisieren) und P0#12 (Update-Signatur) abschließen, dann die kritischen IPC-/Trust-Boundary-Findings aus dem Scan angehen.

---

## Kritische Befunde

### 1. Control-Server: Unbegrenzter Zeilenpuffer
- **Dateien:** `packages/shared-wire/src/transport.ts:39-91`
- **Beschreibung:** `socket.on('data')` hängt Bytes an `buffer` an, bis ein Newline kommt. Ein Client ohne Newline lässt den Puffer unbegrenzt wachsen.
- **Impact:** Speicherüberlastung, DoS gegen lokale IPC.
- **Empfehlung:** Max-Line-Cap (z. B. 1 MiB) einführen und Socket destroyen, wenn überschritten.

### 2. Control-Client: `close()` ist No-Op
- **Dateien:** `packages/shared-wire/src/transport.ts:107-155`
- **Beschreibung:** `ControlClient.close()` gibt nur `Promise.resolve()` zurück. In-Flight-Requests können nicht abgebrochen werden.
- **Impact:** Hängende Sockets, keine Timeout-Strategie.
- **Empfehlung:** Aktive Sockets tracken, auf `close()` destroyen, Timeouts hinzufügen.

### 3. Windows IPC: Renderer kann beliebige Dateien lesen lassen
- **Dateien:** `apps/windows/src/main/session-handlers.ts:19-20` → `group-session.ts:167-176`
- **Beschreibung:** `send-images` nimmt `paths: string[]` aus dem Renderer und ruft `readFile(path)` direkt.
- **Impact:** Kompromittierter Renderer kann sensible Dateien verschlüsselt an den Relay senden.
- **Empfehlung:** Pfade validieren (Whitelist, Extension, stat) oder Main-Prozess besitzt den File-Picker.

### 4. Windows IPC: `r2Key` unvalidiert in URL interpoliert
- **Dateien:** `apps/windows/src/main/session-handlers.ts:54-58` → `core/blob-upload.ts:114-120`
- **Beschreibung:** `downloadBlob` baut `${base}blob/${groupId}/${r2Key}` ohne Validierung.
- **Impact:** Pfad-Traversal auf Relay-Origin möglich.
- **Empfehlung:** `r2Key` gegen `BLOB_KEY_REGEX` validieren, `code` normalisieren.

### 5. Windows IPC: Argumente werden blind gecastet
- **Dateien:** `apps/windows/src/main/session-handlers.ts:7-58`
- **Beschreibung:** IPC-Handler casten Renderer-Argumente (z. B. `open: boolean`, `paths: string[]`) ohne Prüfung.
- **Impact:** `TypeError` im Main-Prozess oder Crashes.
- **Empfehlung:** Zentrale Validierungshelper einführen.

### 6. Browser-APIs im Electron-Main-Prozess
- **Dateien:** `apps/windows/src/core/image-codec.ts:92-120`
- **Beschreibung:** `createImageBitmap` und `OffscreenCanvas` sind DOM-APIs, die in Node/Bun nicht verfügbar sind.
- **Impact:** Bildversand schlägt im Main-Prozess fehl.
- **Empfehlung:** Bildverarbeitung in Renderer auslagern oder Node-native Pipeline verwenden.

### 7. NotchWidget: Race im Image-Preview
- **Dateien:** `apps/windows/src/renderer/components/NotchWidget.tsx:132-153`
- **Beschreibung:** `fetchFullImage` hat keine Request-ID oder Cancellation. Schnelles Wechseln zwischen Bildern kann ein veraltetes Bild anzeigen.
- **Impact:** Falsches Bild wird im Preview angezeigt.
- **Empfehlung:** Request-ID oder `aborted`-Flag einführen.

---

## Wichtige Warnungen

### Races im Windows-State-Management
- `session-store.ts:43-74`: `joinCircle` hat keinen Lock pro Circle-Code.
- `session-store.ts:168-177`: `setRelayUrl` persistiert vor erfolgreichem Connect.
- `relay-client.ts:169-173`: Kein Ping/Pong-Timeout erkennt Half-Open-Sockets.
- `group-session.ts:60, 376`: `receivedImages` wächst unbegrenzt.

### Speicher-/DoS-Flächen
- `NotchWidget.tsx:26`: `fullImageCache` unbegrenzt.
- `image-codec.ts:140-186`: Keine Input-Size-Limits vor Decode.
- `blob-upload.ts:68-159`: Keine `fetch`-Timeouts.

### Protokoll-/Shared-Wire-Lücken
- `payload.ts:146-152`: `assertPayloadFits` zählt Zeichen statt Bytes.
- `crypto.ts:160`: `TextDecoder` ohne `fatal: true`.
- `transport.ts:58, 130`: Keine Runtime-Validierung von Control-Frames.
- `protocol.ts`: `ServerMessage` nur TypeScript, kein Runtime-Schema.

### macOS-Drift
- `AppModel.swift:350-355`: Bild-Uploads lesen beliebige Dateien.
- `GroupSession.swift:261-289`: Eingehende Bilder nicht vollständig validiert.
- `MenuView.swift`: `.help()`-Tooltips können trotz Capture-Exclusion leak.

---

## Info / Wartbarkeit

- `main.ts` überladen (~237 Zeilen).
- `useNotchLifecycle` hat viele gekoppelte `useEffect`.
- `GroupSession.handleFrame` zu lang.
- `encodeProfile` mit fragiler Überladung.
- Keine Tests für `NotchWidget`, `PaletteWindow`, `Avatar`.
- `Buffer` in `shared-wire` nicht browser-kompatibel.
- `rollCode` verwendet `Math.random()`.

---

## Abgeschlossene P0-Fixes seit dem Scan

- **P0#9** Profil-Payload-Drift behoben (`profile-payload-drift-fix`, Commit `7ceb569`).
- **P0#10** `sendChat` auf 2048 Zeichen gekürzt (`sendchat-cap-fix`, Commit `415d98f`).

## Offene P0-Findings

- **P0#11** `sendImages` parallelisieren (Windows)
- **P0#12** Update-Signaturprüfung / Benutzerbestätigung einbauen
