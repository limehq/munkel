# Codebase-Scan: Munkel – Schwächen, Fehler & Over-Engineering

**Datum:** 2026-07-07  
**Scope:** `apps/cli`, `apps/macos`, `apps/server`, `apps/windows`, `packages/shared-wire`  
**Methode:** AgentSwarm mit vier parallelen Read-Only-Reviews (Sicherheit & Krypto, Komplexität & Wartbarkeit, Fehleranfälligkeit & Bug-Patterns, Architektur & Kopplung).  
**Ausgeschlossen:** Build-Ausgaben (`dist/`, `.build/`, `.wrangler/tmp/`), `node_modules`, nicht-source Dateien.

---

## Executive Summary

Die Codebase ist für einen funktionalen Cross-Platform-Messenger mit Fokus auf Ephemerität gut strukturiert, die kryptografischen Grundlagen (AES-256-GCM, HKDF-SHA256, zufällige Nonces) sind korrekt und plattformübergreifend konsistent.

Die größten Risiken liegen jedoch außerhalb der reinen Krypto:

1. **Lokale IPC ist unsicher oder racy.** CLI und Windows-Named-Pipe haben globale Zustände und fehlende Zugriffsbeschränkungen.
2. **Plattform-Drift zwischen macOS und Windows.** Neue Payload-Felder (`status`, `avatarURL`) existieren nur im TypeScript-Teil, Bildvalidierung und -verarbeitung unterscheiden sich massiv.
3. **Race Conditions im Windows-State-Management.** `GroupSession`, `session-store` und die CLI teilen mutable State ohne Synchronisation.
4. **Input-Validierung ist zu lasch.** Control-Requests, Server-Frames und dekodierte Peer-Payloads werden oft nur gecastet, nicht validiert.
5. **Wartbarkeit leidet unter duplizierten Konstanten und einem überladenen `main.ts`.**

Empfohlener nächster Schritt: Einführung einer Synchronisations-/Lock-Schicht pro Circle-Code, harte Trennung der Test-Nonce-API vom Produktiv-API, und eine gemeinsame Validierungs-/Konstanten-Schicht in `@munkel/shared-wire`.

---

## Kritische Befunde

### 1. CLI: Globale `firstLine`-Promise führt zu Race Conditions bei Retries
- **Dateien:** `apps/cli/src/munkel.ts:228–273`, `:361`
- **Beschreibung:** `firstLine`, `resolveFirstLine` und `received` werden auf Modulebene einmalig mit `Promise.withResolvers()` erstellt. Bei einem Retry (Auto-Launch) wird zwar `received = ""` zurückgesetzt, aber die Promise bleibt im bereits resolved/rejected Zustand. Ein zweiter Verbindungsversuch wartet dann auf den Response der ersten Verbindung.
- **Impact:** Fälschliche Antworten, hängende CLI-Aufrufe, fehlerhafte Auto-Launch-Logik.
- **Empfehlung:** `connectUnixSocket` in eine Factory umwandeln, die pro Verbindung einen frischen Zustand zurückgibt – analog zu `sendOverPipe` auf Windows.

### 2. Windows Named Pipe ohne Sicherheitsbeschreibung
- **Dateien:** `packages/shared-wire/src/control.ts:36–38`, `packages/shared-wire/src/transport.ts:39–91`
- **Beschreibung:** Der Pipe-Name `\\.\pipe\Munkel-<user>-Control` ist vorhersagbar. `net.createServer` erzeugt Named Pipes ohne explizite DACL; andere Prozesse im gleichen Sitzungskontext können sich verbinden und `send`-/`imagePaths`-Requests absetzen.
- **Impact:** Lokale Rechteausweitung: Ein Angreifer kann Nachrichten im Namen des Nutzers senden oder über `imagePaths` beliebige Dateien lesen lassen.
- **Empfehlung:** Pipe mit expliziter DACL anlegen (nur erstellender Benutzer + Administrator) oder Challenge-Response-Token zwischen App und CLI etablieren.

### 3. Race Conditions im Windows-Session-Management
- **Dateien:** `apps/windows/src/main/session-store.ts:43–74`, `:150–159`, `apps/windows/src/main/group-session.ts:225`, `:238–383`
- **Beschreibung:** `setRelayUrl` löscht die alte Session und `await`-et dann `joinCircle`. Parallel können weitere `joinCircle`-Aufrufe (Renderer, CLI) die Map verändern. `handleFrame` mutiert `this.members` asynchron ohne Synchronisation; gleichzeitige `sendProfile`/`broadcastPresence` greifen auf denselben State zu.
- **Impact:** Mehrere Sessions für denselben Circle, inkonsistente Member-Listen, verlorene Nachrichten.
- **Empfehlung:** Eine `joinLock` pro Circle-Code (`Map<string, Promise<void>>`) einführen und Member-Mutationen serialisieren oder auf unveränderliche Kopien arbeiten.

### 4. `shell.openExternal` ohne URL-Validierung
- **Datei:** `apps/windows/src/main/github-login.ts:79`
- **Beschreibung:** Die `verificationURI` aus der GitHub-Device-Flow-Response wird direkt an `shell.openExternal` übergeben.
- **Impact:** Bei kompromittiertem GitHub-Response oder MITM kann eine `file://`- oder andere schädliche URL geöffnet werden.
- **Empfehlung:** URI auf `https://github.com/...` bzw. erlaubtes Schema/Host-Pattern validieren.

### 5. `IdentityStore.save` ohne Berechtigungsbeschränkung
- **Datei:** `apps/windows/src/main/identity-store.ts:57–60`
- **Beschreibung:** `state.json` wird mit `fs.writeFileSync(this.filePath, ...)` ohne `mode` geschrieben. Unter Windows/Linux können dadurch andere Benutzer die Datei lesen.
- **Impact:** Leak von `memberId`, `displayName`, `githubLogin` und Avatar.
- **Empfehlung:** `fs.writeFileSync(..., { mode: 0o600 })` verwenden und bestehende Dateien mit `fs.chmodSync` einschränken.

### 6. Windows-Bilddecoding ohne Größenlimits
- **Datei:** `apps/windows/src/core/image-codec.ts:92–99`
- **Beschreibung:** `decodeToBitmap` ruft `createImageBitmap(blob)` ohne Größenlimits auf. Ein kleines, hochkomprimiertes Bild kann riesige Dimensionen deklarieren und den Renderer-Hauptspeicher vor dem Downsampling erschöpfen.
- **Impact:** DoS durch Bilddekompressions-Bombe.
- **Empfehlung:** Vor dem Voll-Decode mit `imageCodec.probe` Header-Dimensionen prüfen und/oder `createImageBitmap` mit `resizeWidth`/`resizeHeight`-Optionen aufrufen.

### 7. `OffscreenCanvas`/`createImageBitmap` im Electron-Main-Prozess
- **Datei:** `apps/windows/src/core/image-codec.ts:112–113`
- **Beschreibung:** Diese Web-APIs werden direkt im Main-Prozess verwendet, sind dort aber nicht garantiert verfügbar.
- **Impact:** `ReferenceError` im Produktivbetrieb, kompletter Ausfall des Bildversands.
- **Empfehlung:** Verfügbarkeit zur Laufzeit prüfen oder Bildverarbeitung in den Renderer-Prozess auslagern / Node-kompatibles Canvas-Modul verwenden.

### 8. `RelayClient.handleConnectionLost` hat Race zwischen `error` und `close`
- **Datei:** `apps/windows/src/main/relay-client.ts:106–158`
- **Beschreibung:** Der Kommentar behauptet Idempotenz, aber zwischen der Prüfung `if (this.socket !== socket) return` und `this.socket = null` kann ein zweiter Handler eintreten. `emit('disconnected')` erfolgt bevor `this.socket = null` gesetzt wird.
- **Impact:** `send()` kann auf einer toten Socket landen; doppelte Disconnect-Events.
- **Empfehlung:** Socket-Referenz lokal speichern, sofort auf `null` setzen, dann erst teardown/emit durchführen.

### 9. Profil-Payload-Drift: macOS sendet keinen Presence-Status
- **Dateien:** `apps/macos/Sources/MunkelKit/AppPayload.swift:29`, `packages/shared-wire/src/payload.ts:12–18`, `apps/windows/src/main/group-session.ts:309–322`
- **Beschreibung:** TypeScript kennt `status`/`avatarURL` in `ProfilePayload`; macOS `AppPayload.profile` enthält nur `displayName` und `avatar`. Windows setzt `decoded.status` auf `undefined`, wenn ein macOS-Peer ein Profil sendet, und überschreibt ggf. einen vorher bekannten Status.
- **Impact:** Inkonsistente Presence-Anzeige; Bruch des “E2E-kompatiblen Wire Protocol”-Versprechens.
- **Empfehlung:** Entweder macOS `AppPayload.profile` erweitern oder Windows beim Fehlen von `status` den bestehenden Wert beibehalten.

### 10. `GroupSession.sendChat` kürzt Text nicht auf 2048 Zeichen
- **Dateien:** `apps/windows/src/main/group-session.ts:108–110`, `apps/macos/Sources/MunkelApp/MessageLimits.swift:9`, `GroupSession.swift:76`
- **Beschreibung:** macOS kürgt Chat-Text vor dem Sealing auf 2048 Zeichen. Windows übergibt den Text unverändert und lehnt erst bei `MAX_PAYLOAD_CHARS` (~48 KiB) ab.
- **Impact:** Plattformübergreifend unterschiedliches Verhalten bei langen Texten.
- **Empfehlung:** In `encodeChat` oder `sendChat` denselben 2048-Zeichen-Clamp wie macOS anwenden.

### 11. Windows `sendImages` verarbeitet Bilder sequentiell
- **Dateien:** `apps/windows/src/main/group-session.ts:136–187`, `apps/macos/Sources/MunkelApp/GroupSession.swift:94–159`
- **Beschreibung:** Windows liest, kodiert und lädt Bilder nacheinander hoch. macOS nutzt `Task.detached` und `withThrowingTaskGroup` für parallele Vorbereitung und Upload.
- **Impact:** Deutlich langsamere Alben; ein Fehler bei Bild N bricht den gesamten Vorgang ab.
- **Empfehlung:** Windows-Implementierung auf `Promise.all` oder `p-limit` umbauen.

### 12. `update-service.ts` installiert Updates ohne Bestätigung / Signaturprüfung
- **Datei:** `apps/windows/src/main/update-service.ts:106–110`
- **Beschreibung:** `quitAndInstall(false, true)` wird aufgerufen, sobald `installUpdate` aufgerufen wird. Es gibt keine Sicherheitsprüfung der Signatur außer einer String-Suche in der Fehlermeldung.
- **Impact:** Mögliche Installation kompromittierter Updates.
- **Empfehlung:** Vor Installation Signatur-/Hash-Prüfung durchführen oder Benutzer explizit bestätigen lassen.

---

## Warnungen

### 13. Server: Blob-Upload ohne Streaming-Limit
- **Datei:** `apps/server/src/blob.ts:66–77`
- **Beschreibung:** `PUT /blob/:group/:key` prüft `Content-Length`, lädt aber mit `c.req.arrayBuffer()` den gesamten Body. Fehlt oder lügt der Header, kann ein Client bis zur Worker-Speichergrenze streamen.
- **Empfehlung:** Body als Stream konsumieren und nach `MAX_BLOB_BYTES + 1` abbrechen.

### 14. Server / Clients: Kein Rate-Limiting auf Relay-Nachrichten
- **Datei:** `apps/server/src/group-room.ts:68–103`
- **Beschreibung:** `onMessage` validiert das Schema und relayt sofort. Kein Rate-Limit pro `memberId` oder Gruppe.
- **Empfehlung:** Token-Bucket oder Zeitfenster pro Verbindung/Member einführen.

### 15. `Buffer` in `shared-wire` ist nicht browser-kompatibel
- **Dateien:** `packages/shared-wire/src/payload.ts:69–71`, `packages/shared-wire/src/crypto.ts:99`, `:146`
- **Beschreibung:** Mehrere Stellen nutzen `Buffer.from(...)` für Base64. `Buffer` ist kein Browser-Global.
- **Empfehlung:** Plattformunabhängigen Base64-Helper verwenden (`globalThis.btoa`/`atob` oder eigene Utility).

### 16. `ControlRequest` wird nur gecastet, nicht validiert
- **Datei:** `packages/shared-wire/src/transport.ts:58`
- **Beschreibung:** `createControlServer` castet empfangene JSON-Zeilen mit `as ControlRequest`, ohne Feldtypen zu prüfen.
- **Empfehlung:** Zod-Schema für `ControlRequest` definieren (analog zu `clientMessageSchema`).

### 17. `ServerMessage` hat keine Laufzeitvalidierung
- **Dateien:** `packages/shared-wire/src/protocol.ts:41–47`, `apps/windows/src/main/relay-client.ts:195`, `apps/macos/Sources/MunkelKit/RelayClient.swift:71`
- **Beschreibung:** `ServerMessage` ist nur ein TypeScript-Union-Type; Clients casten/parse und schlucken Decode-Fehler still.
- **Empfehlung:** `serverMessageSchema` mit `z.discriminatedUnion` ergänzen und in allen Clients validieren.

### 18. `createControlServer` puffert unbegrenzt
- **Datei:** `packages/shared-wire/src/transport.ts:48–54`
- **Beschreibung:** Der Server puffert eingehende Daten bis zum nächsten `\n`, ohne Maximallänge.
- **Empfehlung:** Maximale Zeilenlänge (z. B. 64 KiB) erzwingen; Socket bei Überschreitung zerstören.

### 19. `createControlServer` hält Verbindungen ohne Timeout offen
- **Datei:** `packages/shared-wire/src/transport.ts:39–91`
- **Beschreibung:** Ein Client, der nie ein Newline sendet, hält die Verbindung unbegrenzt offen.
- **Empfehlung:** Verbindungs-Timeout von 5–10 Sekunden setzen.

### 20. Leerer Circle-Code erzeugt vorhersagbare Schlüssel
- **Datei:** `apps/macos/Sources/MunkelKit/GroupKey.swift:13–33`
- **Beschreibung:** `GroupKey.init(code:)` normalisiert, wirft aber bei leerem Code nicht. HKDF mit leerem IKM produziert reproduzierbare `groupId`/`messageKey`.
- **Empfehlung:** Leeren Code explizit ablehnen, analog zu `packages/shared-wire/src/normalize.ts:8`.

### 21. macOS `BlobClient` akzeptiert URL-Anmeldedaten
- **Datei:** `apps/macos/Sources/MunkelKit/BlobClient.swift:24–37`
- **Beschreibung:** `baseURL(fromRelay:)` akzeptiert `wss://user:pass@host/ws` und sendet Credentials stillschweigend mit. Windows lehnt solche URLs korrekterweise ab.
- **Empfehlung:** In `BlobClient.baseURL` `user`/`password` prüfen und `nil` zurückgeben.

### 22. `sentAt`-Validierung inkonsistent zwischen macOS und TypeScript
- **Dateien:** `packages/shared-wire/src/payload.ts:181–184`, `:212–215`; `apps/macos/Sources/MunkelKit/AppPayload.swift:107–111`
- **Beschreibung:** TypeScript nutzt `Date.parse` (tolerant), macOS `ISO8601DateFormatter` (strenger).
- **Empfehlung:** Strikten ISO-8601-Regex oder Roundtrip in TypeScript verwenden.

### 23. `restoreCircles` prüft Hostname mit Regex auf ganzer URL
- **Datei:** `apps/windows/src/main/session-store.ts:185–187`
- **Beschreibung:** `/(?:127\.0\.0\.1|localhost)/` matched auf die komplette URL, nicht nur auf den Hostnamen.
- **Empfehlung:** `new URL(circle.relayUrl).hostname` vergleichen.

### 24. `IdentityStore` regeneriert bei korruptem State eine neue Identität
- **Datei:** `apps/windows/src/main/identity-store.ts:46–54`
- **Beschreibung:** Bei `JSON.parse`-Fehler wird sofort `defaultState()` mit neuem `memberId` erstellt.
- **Empfehlung:** Korrupte Datei sichern (`state.json.bak`) und nur bei unvollständigen Feldern migrieren.

### 25. `getWindowUrl` verwendet `VITE_DEV_SERVER_URL` ohne Validierung
- **Datei:** `apps/windows/src/main/window-url.ts:6–10`
- **Beschreibung:** Eine manipulierte Umgebungsvariable kann den Renderer auf eine externe Seite umleiten.
- **Empfehlung:** URL parsen und auf `http://localhost:*` oder `file://` beschränken.

### 26. `Avatar.tsx` hartkodiert `data:image/jpeg`
- **Datei:** `apps/windows/src/renderer/components/Avatar.tsx:71`
- **Beschreibung:** Avatare werden immer als JPEG data-URI gerendert. Andere Formate werden falsch dargestellt.
- **Empfehlung:** MIME-Typ zusammen mit dem String speichern oder auf bestehende `data:`-Präfixe prüfen.

### 27. `ControlServer` in macOS schluckt JSON-Decode-Fehler
- **Datei:** `apps/macos/Sources/MunkelApp/ControlServer.swift:70`
- **Beschreibung:** `try? JSONDecoder().decode(...)` liefert bei ungültigem JSON `nil` und eine generische Fehlerantwort.
- **Empfehlung:** Explizites `catch` mit strukturiertem Fehler im `ControlResponse`.

### 28. `AppState.broadcastProfiles` fire-and-forget ohne Fehlerbehandlung
- **Datei:** `apps/windows/src/main/session-store.ts:202–206`
- **Beschreibung:** `void session.sendProfile()` wird ohne `await` aufgerufen.
- **Empfehlung:** Zumindest loggen oder `Promise.allSettled` verwenden.

### 29. Bildvalidierung im Control-Protokoll nur auf Windows vorhanden
- **Dateien:** `apps/windows/src/main/control-handlers.ts:102–161`, `apps/macos/Sources/MunkelApp/AppModel.swift:346–355`
- **Beschreibung:** Windows prüft Dateigröße (50 MiB), Erweiterung und Existenz. macOS versucht nur, die Datei zu lesen.
- **Empfehlung:** Validierungslogik in macOS übernehmen oder in `@munkel/shared-wire` auslagern.

### 30. Duplizierte Konstanten für Bildlimits
- **Dateien:** `apps/macos/Sources/MunkelKit/AppPayload.swift:37–47`, `apps/windows/src/core/image-codec.ts:34–55`, `packages/shared-wire/src/wire-constants.ts`
- **Beschreibung:** `maxImagesPerMessage` / `MAX_IMAGES_PER_MESSAGE` / Magic Number 8 und `albumThumbBudget` sind an mehreren Stellen definiert.
- **Empfehlung:** Alle wire-relevanten Limits zentral in `@munkel/shared-wire/wire-constants` definieren.

### 31. Unterschiedliche TypeScript-Versionen im Monorepo
- **Dateien:** `apps/windows/package.json:39`, `apps/cli/package.json:18`, `apps/server/package.json:18`, `apps/landing/package.json:46`
- **Beschreibung:** Windows verwendet TypeScript `^5.4.5`, die anderen Apps `^6.0.3`.
- **Empfehlung:** Einheitliche TypeScript-Version über `resolutions`/`overrides` oder gemeinsame Root-DevDependencies erzwingen.

### 32. `blobBaseUrl()` ersetzt nur exakt `/ws`
- **Datei:** `apps/windows/src/core/blob-upload.ts:37–39`
- **Beschreibung:** Wird der Relay hinter `/v1/ws` betrieben, bleibt der Pfad erhalten und der Upload zeigt falsch.
- **Empfehlung:** `/ws`-Suffix explizit vom Path-Ende entfernen oder URL-Konvention dokumentieren.

---

## Info / Wartbarkeit

### 33. `apps/windows/src/main/main.ts` ist überladen
- **Datei:** `apps/windows/src/main/main.ts`
- **Beschreibung:** ~237 Zeilen vereinen App-Lifecycle, Window-Management, IPC-Registrierung, State-Initialisierung, Updates, GitHub-Login, Presence-Monitor und Control-Server.
- **Empfehlung:** In `ipc-registry.ts`, `lifecycle.ts`, `services.ts` aufteilen; `main.ts` nur als Kompositionswurzel belassen.

### 34. `useNotchLifecycle` hat viele gekoppelte `useEffect`
- **Datei:** `apps/windows/src/renderer/lib/useNotchLifecycle.ts`
- **Beschreibung:** Sechs `useEffect` verwalten Timer, History, Phase, Hover, Copy-Feedback und IPC.
- **Empfehlung:** In einen Reducer oder eine zentrale Zustandsmaschine überführen.

### 35. `GroupSession.handleFrame` ist zu lang
- **Datei:** `apps/windows/src/main/group-session.ts:238–383`
- **Beschreibung:** Eine Methode behandelt Verbindungszustand, Presence, Profile, Chat, Bilder und Fehler.
- **Empfehlung:** In kleinere private Methoden pro Frame-Typ aufteilen.

### 36. `encodeProfile` hat fragile Überladung
- **Datei:** `packages/shared-wire/src/payload.ts:89–112`
- **Beschreibung:** Zwei Signaturen (legacy positional + options object) werden über fragilen Laufzeit-Check unterschieden.
- **Empfehlung:** Ein einziges Options-Interface verwenden.

### 37. `assertPayloadFits` prüft die falsche Einheit
- **Datei:** `packages/shared-wire/src/payload.ts:146–152`
- **Beschreibung:** Prüft `json.length` (Zeichen) statt der geschätzten versiegelten Größe.
- **Empfehlung:** Pre-Seal-Check gegen die versiegelte Base64-Größe prüfen.

### 38. `asBufferSource` ist eine Typ-Assertion ohne Laufzeitschutz
- **Datei:** `packages/shared-wire/src/crypto.ts:66–69`
- **Beschreibung:** Castet `Uint8Array` zu `BufferSource`; kein echter Schutz.
- **Empfehlung:** Echten Adapter verwenden, der `ArrayBuffer`/`Uint8Array` normalisiert.

### 39. macOS: Fire-and-Forget-Sends ohne Ergebnisprüfung
- **Datei:** `apps/macos/Sources/MunkelApp/AppModel.swift:114–136`, `:141–187`
- **Beschreibung:** `send(text:group:)` und `send(images:...)` starten `Task`, werten aber das Bool-Ergebnis nicht aus.
- **Empfehlung:** Ergebnis prüfen und bei Fehler Nutzer-Feedback geben.

### 40. `rollCode` verwendet `Math.random`
- **Datei:** `apps/windows/src/renderer/components/MenuWindow.tsx:43–48`
- **Beschreibung:** Der zufällige Code-Vorschlag ist nicht kryptographisch stark.
- **Empfehlung:** `crypto.getRandomValues` verwenden.

### 41. `MenuWindow` Escape-Handler ist nicht global
- **Datei:** `apps/windows/src/renderer/components/MenuWindow.tsx:88–91`
- **Beschreibung:** `onKeyDown` für Escape ist nur aktiv, wenn der Fokus im `div` liegt.
- **Empfehlung:** Globalen `keydown`-Listener verwenden.

### 42. Electron-Version ist veraltet
- **Datei:** `apps/windows/package.json:36`
- **Beschreibung:** Electron `^31.0.2`; aktuell stable ist 33+.
- **Empfehlung:** Regelmäßiges Upgrade planen und CI auf Sicherheitswarnungen prüfen.

### 43. Magic Numbers in Fenster-Modulen
- **Dateien:** `apps/windows/src/main/menu-window.ts`, `notch-window.ts`, `palette-window.ts`
- **Beschreibung:** Dimensionen, Positionen und Delays sind hartkodiert.
- **Empfehlung:** In ein `window-layout.ts`-Modul auslagern.

---

## Empfohlene Priorisierung

| Priorität | Maßnahme | Betroffene Dateien |
|-----------|----------|---------------------|
| P0 | CLI-Retry-Race beheben | `apps/cli/src/munkel.ts` |
| P0 | Windows Named Pipe absichern | `packages/shared-wire/src/transport.ts` |
| P0 | Session-/Member-State synchronisieren | `apps/windows/src/main/session-store.ts`, `group-session.ts` |
| P1 | Bilddecoding-DoS-Schutz auf Windows | `apps/windows/src/core/image-codec.ts` |
| P1 | Profil-Payload-Drift beheben | `apps/macos/Sources/MunkelKit/AppPayload.swift`, `apps/windows/src/main/group-session.ts` |
| P1 | Updatesignaturprüfung / Benutzerbestätigung | `apps/windows/src/main/update-service.ts` |
| P2 | Zentrale Validierungsschicht in `shared-wire` | `packages/shared-wire/src/control.ts`, `protocol.ts`, `payload.ts` |
| P2 | Konstanten für Limits zentralisieren | `packages/shared-wire/src/wire-constants.ts` |
| P2 | `main.ts` modularisieren | `apps/windows/src/main/main.ts` |
| P3 | TypeScript-Versionen vereinheitlichen | `package.json`, `apps/*/package.json` |
| P3 | Tests für Windows-Bildcodec wieder aktivieren | `apps/windows/src/core/__tests__/image-codec.test.ts` |

---

## Offene Fragen für das Team

1. Soll die lokale IPC langfristig durch ein Challenge-Response-Token (z. B. pro App-Start generiert) abgesichert werden, oder reicht eine DACL auf dem Named Pipe?
2. Soll `status`/`avatarURL` in macOS implementiert werden, oder sollen die Felder aus dem TypeScript-Protokoll entfernt werden, bis beide Plattformen bereit sind?
3. Gibt es einen geplanten Electron-Upgrade-Pfad, und wie wird mit Chromium-Sicherheitsupdates umgegangen?
4. Soll `@munkel/shared-wire` browser-kompatibel sein, oder ist es bewusst Node/Bun-only?
