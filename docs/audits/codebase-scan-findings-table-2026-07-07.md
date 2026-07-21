# Munkel Codebase-Scan: Findings-Tabelle

**Datum:** 2026-07-07  
**Scope:** `apps/cli`, `apps/macos`, `apps/server`, `apps/windows`, `packages/shared-wire`  
**Methode:** AgentSwarm-Review (4 parallele Read-Only-Reviews)

---

## Legende

| Bewertung | Bedeutung |
|-----------|-----------|
| 🔴 Kritisch | Sicherheitsrisiko, Datenverlust oder stabiler Bug; sollte sofort behoben werden |
| 🟡 Warnung | Inkonsistenz, fehlende Robustheit oder erhöhtes Bug-Potenzial; bald angehen |
| 🟢 Info | Wartbarkeit, Duplikation oder kleinere Verbesserung |

---

## Findings

| # | Kategorie | Finding | Erläuterung | Bewertung |
|---|-----------|---------|-------------|-----------|
| 1 | IPC / CLI | Globale `firstLine`-Promise in `apps/cli/src/munkel.ts` | Promise wird auf Modulebene einmalig erzeugt; bei Retry/Auto-Launch wartet die CLI auf den Response der ersten Verbindung | 🔴 |
| 2 | IPC / Sicherheit | Windows Named Pipe ohne DACL in `packages/shared-wire/src/transport.ts` | Vorhersagbarer Pipe-Name `Munkel-<user>-Control` ohne Sicherheitsbeschreibung; andere Prozesse können sich verbinden | 🔴 |
| 3 | Race Condition | `session-store.ts` / `group-session.ts` teilen mutable State | `joinCircle`, `setRelayUrl` und Frame-Handler mutieren `members`/Sessions ohne Synchronisation | 🔴 |
| 4 | Sicherheit | `shell.openExternal` ohne URL-Validierung in `github-login.ts` | `verificationURI` aus GitHub-Response wird direkt geöffnet; `file://` oder andere Schemas möglich | 🔴 |
| 5 | Sicherheit | `IdentityStore.save` ohne Dateiberechtigungen | `state.json` wird ohne `mode: 0o600` geschrieben; andere Benutzer können lesen | 🔴 |
| 6 | Sicherheit / DoS | Bilddekompressions-Bombe in `apps/windows/src/core/image-codec.ts` | `createImageBitmap(blob)` ohne Größenlimits; kleine Dateien können riesige Dimensionen deklarieren | 🔴 |
| 7 | Stabilität | `OffscreenCanvas` im Electron-Main-Prozess | Web-APIs sind im Main-Prozess nicht garantiert verfügbar; Bildversand kann komplett ausfallen | 🔴 |
| 8 | Race Condition | `RelayClient.handleConnectionLost` nicht idempotent | `error`/`close` können gleichzeitig feuern; `emit('disconnected')` vor `socket = null` | 🔴 |
| 9 | Protokoll-Drift | macOS sendet keinen Presence-Status | `ProfilePayload.status`/`avatarURL` existieren nur in TypeScript; macOS-Peers überschreiben Windows-Status mit `undefined` | 🔴 |
| 10 | Plattform-Drift | `sendChat` kürzt Text nicht auf 2048 Zeichen | Windows lässt Texte bis ~48 KiB durch, macOS kürgt auf 2048 Zeichen | 🔴 |
| 11 | Performance / Robustheit | `sendImages` auf Windows sequentiell | macOS lädt parallel; Windows ist langsamer und bricht bei Fehler komplett ab | 🔴 |
| 12 | Sicherheit | Updates ohne Signaturprüfung in `update-service.ts` | `quitAndInstall` wird direkt aufgerufen; keine Hash-/Signaturprüfung | 🔴 |
| 13 | Server / DoS | Blob-Upload ohne Streaming-Limit in `apps/server/src/blob.ts` | `c.req.arrayBuffer()` lädt den gesamten Body; fehlender/lügender `Content-Length` führt zu Speicherüberlastung | 🟡 |
| 14 | Server / DoS | Kein Rate-Limiting auf Relay-Nachrichten | Ein Client kann mit Hochgeschwindigkeit Frames senden und DO/Peers belasten | 🟡 |
| 15 | Kompatibilität | `Buffer` in `packages/shared-wire` | `Buffer.from` ist kein Browser-Global; spätere Verwendung in Web-Worker/Renderer führt zu Laufzeitfehlern | 🟡 |
| 16 | Validierung | `ControlRequest` wird nur gecastet | `as ControlRequest` ohne Feldprüfung; beliebige Werte können eindringen | 🟡 |
| 17 | Validierung | `ServerMessage` hat keine Laufzeitvalidierung | Clients casten/parse und schlucken Decode-Fehler still | 🟡 |
| 18 | DoS | `createControlServer` puffert unbegrenzt | Keine Maximallänge für Zeilenpuffer; Speicherüberlastung möglich | 🟡 |
| 19 | DoS | `createControlServer` ohne Verbindungs-Timeout | Client ohne Newline hält Verbindung unbegrenzt offen | 🟡 |
| 20 | Krypto | Leerer Circle-Code erzeugt vorhersagbare Schlüssel | `GroupKey.init(code:)` wirft bei leerem Code nicht; HKDF mit leerem IKM | 🟡 |
| 21 | Sicherheit | macOS `BlobClient` akzeptiert URL-Credentials | `wss://user:pass@host/ws` wird stillschweigend weitergegeben; Windows lehnt korrekterweise ab | 🟡 |
| 22 | Plattform-Drift | `sentAt`-Validierung inkonsistent | TypeScript nutzt `Date.parse` (tolerant), macOS `ISO8601DateFormatter` (streng) | 🟡 |
| 23 | Validierung | `restoreCircles` prüft Hostname mit Regex auf ganzer URL | `localhost` im Pfad/Query führt zu falscher Erkennung | 🟡 |
| 24 | Robustheit | `IdentityStore` resettet bei korruptem State | `JSON.parse`-Fehler erzeugt neue `memberId`; Nutzer verliert Identität | 🟡 |
| 25 | Sicherheit | `getWindowUrl` verwendet `VITE_DEV_SERVER_URL` ohne Validierung | Manipulierte Env-Variable kann Renderer auf externe Seite umleiten | 🟡 |
| 26 | Rendering | `Avatar.tsx` hartkodiert `data:image/jpeg` | Andere Avatar-Formate werden falsch dargestellt | 🟡 |
| 27 | Fehlerbehandlung | macOS `ControlServer` schluckt JSON-Decode-Fehler | `try?` liefert nur generische `"Invalid request"`-Antwort | 🟡 |
| 28 | Fehlerbehandlung | `broadcastProfiles` fire-and-forget | `void session.sendProfile()` ohne `await` oder Logging | 🟡 |
| 29 | Plattform-Drift | Bildvalidierung nur auf Windows | macOS liest Dateien ohne Größen-/Erweiterungsprüfung | 🟡 |
| 30 | Wartbarkeit | Bildlimits sind dupliziert | `MAX_IMAGES_PER_MESSAGE` / Magic Number 8 / `maxImagesPerMessage` an mehreren Stellen | 🟡 |
| 31 | Tooling | Unterschiedliche TypeScript-Versionen | Windows `^5.4.5`, andere Apps `^6.0.3` | 🟡 |
| 32 | Robustheit | `blobBaseUrl()` ersetzt nur exakt `/ws` | Relay hinter `/v1/ws` führt zu falscher Blob-URL | 🟡 |
| 33 | Wartbarkeit | `apps/windows/src/main/main.ts` ist überladen | ~237 Zeilen vereinen Lifecycle, IPC, State, Updates, Login, Presence, Control-Server | 🟢 |
| 34 | Wartbarkeit | `useNotchLifecycle` hat viele gekoppelte `useEffect` | Sechs Effects verwalten Timer, History, Hover etc. | 🟢 |
| 35 | Wartbarkeit | `GroupSession.handleFrame` zu lang | Eine Methode behandelt alle Frame-Typen | 🟢 |
| 36 | Wartbarkeit | `encodeProfile` mit fragiler Überladung | Laufzeit-Check zwischen positional und options object | 🟢 |
| 37 | Korrektheit | `assertPayloadFits` prüft Zeichen statt Bytes | `json.length` ≠ versiegelte Base64-Größe | 🟢 |
| 38 | Typsicherheit | `asBufferSource` ist reiner Cast | Kein Laufzeitschutz für TypedArray-Form | 🟢 |
| 39 | Fehlerbehandlung | macOS Fire-and-Forget-Sends | `send(text:)` / `send(images:)` werten Bool-Ergebnis nicht aus | 🟢 |
| 40 | Sicherheit | `rollCode` verwendet `Math.random` | Code-Vorschlag nicht kryptographisch stark | 🟢 |
| 41 | UX | `MenuWindow` Escape-Handler nicht global | `onKeyDown` nur aktiv, wenn Fokus im `div` liegt | 🟢 |
| 42 | Sicherheit | Electron 31 ist veraltet | Stable ist 33+; bekannte Chromium/Node-Lücken | 🟢 |
| 43 | Wartbarkeit | Magic Numbers in Fenster-Modulen | Dimensionen/Positionen/Delays hartkodiert in `menu-window.ts`, `notch-window.ts`, `palette-window.ts` | 🟢 |

---

## Kurzbeurteilung

| Bereich | Zustand | Hauptprobleme |
|---------|---------|---------------|
| Krypto | ✅ solide | AES-256-GCM, HKDF, Nonce-Handling korrekt |
| Lokale IPC | 🔴 problematisch | Race Conditions, fehlende DACL, unbegrenzte Puffer |
| Windows-Client | 🟡 verbesserungswürdig | Race Conditions, DoS-Bildpfad, veraltete Electron-Version |
| macOS-Client | 🟡 gut, aber Drift | Fehlt `status`/`avatarURL`, Bildvalidierung zu lasch |
| Server | 🟡 robust, aber ungeschützt | Kein Rate-Limit, Blob-Upload ohne Stream-Cap |
| Protokoll/Shared-Wire | 🟡 Inkonsistenzen | `Buffer`-Nutzung, duplizierte Konstanten, fehlende Laufzeitvalidierung |
| Architektur | 🟢 funktional | `main.ts` überladen, viele Magic Numbers |
