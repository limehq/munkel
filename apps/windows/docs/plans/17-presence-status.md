# Plan 17: Presence / Online-Status mit Ruhemodus

> **Status:** Implemented / Verified  
> **Branch:** `platform/windows/feature/presence-status`  
> **Base:** `platform/windows/ios-feature-sync`  
> **Estimate:** 2 sessions  
> **Type:** Feature / iOS-Parity

## Problem

Windows-Clients haben keinen Online-Status. Sie erscheinen immer als `online`, unterstützen keinen Ruhemodus / Do-Not-Disturb und unterdrücken die Notch nicht, wenn der Nutzer abwesend ist. macOS hat dagegen ein vollständiges Presence-System mit drei Zuständen (`online`, `dnd`, `away`), Auto-Away nach 5 Minuten Idle, Sleep/Lock-Erkennung und Wire-Payloads (`profile` + `presence`).

## Goal

- Vollständige Parität mit macOS Presence:
  - Drei Zustände: `online`, `dnd`, `away`.
  - `away` ist wählbar und wird zusätzlich automatisch aus Idle/Sleep/Lock abgeleitet.
  - Status-Picker in `MenuWindow`.
  - Status-Dot auf Avataren.
  - Notch-Preview wird bei `dnd`/`away` unterdrückt.
- Wire-Protokoll bleibt mit macOS kompatibel.
- Forward compatibility: unbekannte/fehlende Status decodieren als `online`.

## Root-Cause-Analyse

### 1. Shared-Wire-Protokoll fehlt Status

`packages/shared-wire/src/payload.ts` kennt nur `chat`, `profile` (ohne `status`) und `image`. Es gibt kein `presence`-Payload-Kind.

### 2. Windows-Datentypen kennen keinen Status

- `Member` in `apps/windows/src/shared/types.ts` hat kein `status`-Feld.
- `IdentityState` hat kein `presenceStatus`.

### 3. Keine Idle-/Sleep-/Lock-Erkennung

Windows nutzt weder `GetLastInputInfo` noch Electron `powerMonitor` für Auto-Away.

### 4. Keine UI für Presence

- `MenuWindow.tsx` hat keinen Status-Picker.
- `Avatar.tsx` rendert keinen Status-Dot.
- `NotchWidget.tsx` / `useNotchLifecycle.ts` kennen kein `silent`-Flag.

### 5. Kein Senden/Empfangen von Presence

`group-session.ts` broadcastet keinen Status und aktualisiert keine Member-Status.

## Konkrete Änderungen

### `packages/shared-wire/src/payload.ts`

1. `PresenceStatus`-Literal-Typ hinzufügen:
   ```ts
   export type PresenceStatus = 'online' | 'dnd' | 'away';
   ```
2. `ProfilePayload` um `status` erweitern:
   ```ts
   export type ProfilePayload = {
     kind: 'profile';
     displayName: string;
     avatar?: string;
     avatarURL?: string;
     status?: PresenceStatus;
   };
   ```
3. Neues `PresencePayload` anlegen:
   ```ts
   export type PresencePayload = {
     kind: 'presence';
     status: PresenceStatus;
   };
   ```
4. `avatarURL` optional in `ProfilePayload` hinzufügen (macOS sendet URL, Windows aktuell Inline-Bytes). Empfänger priorisieren `avatarURL`, falls vorhanden, sonst `avatar`. Windows kann zunächst weiterhin `avatar` senden.
5. `encodeProfile(displayName, avatar?, status?)` erweitern, damit `status` und `avatarURL` mitgesendet werden können.
6. `decodePayload` erweitern:
   - `presence`-Kind decodieren.
   - Fehlenden/unbekannten Status als `'online'` behandeln.

### `apps/windows/src/shared/types.ts`

1. `Member` erweitern (bestehende Felder beibehalten):
   ```ts
   export interface Member {
     memberId: string;
     displayName?: string;
     avatar?: string;
     joinedAt: string;
     status?: PresenceStatus;
   }
   ```
2. `IdentityState` erweitern:
   ```ts
   export type IdentityState = {
     displayName: string;
     avatar?: string;
     memberId?: string;
     presenceStatus: PresenceStatus;
   };
   ```
3. `NotchMessage` um `silent?: boolean` erweitern (oder separat übergeben).

### `apps/windows/src/main/identity-store.ts`

1. `presenceStatus` persistieren (Default `online`).
2. Getter/Setter analog `displayName`.

### `apps/windows/src/main/session-store.ts`

1. `IdentityState` inkl. `presenceStatus` in `AppState` führen.
2. `StateUpdate` Broadcasts enthalten `presenceStatus`.
3. `IdentityUpdate` **nicht** um `presenceStatus` erweitern; Status wird über separaten `setPresenceStatus`-Pfad geändert.
4. Neue Methode `broadcastPresenceStatus(status)` oder ähnlich, die an alle `GroupSession`s weitergeleitet wird.

### `apps/windows/src/main/group-session.ts`

1. `Member` mit `status` führen.
2. `sendProfile()` um `status` erweitern.
3. Neue Methode `broadcastPresence(status)`.
4. `handleIncoming` für `profile` und `presence` Member-Status aktualisieren.
5. `onStateChange` triggern bei Status-Änderungen.

### `apps/windows/src/main/main.ts` + neuer `PresenceMonitor`

1. Neue Komponente `apps/windows/src/main/presence-monitor.ts` erstellen (injizierbar, damit sie testbar ist):
   ```ts
   export interface IdleTimeSource {
     getIdleTimeMs(): number;
     onLock(cb: () => void): () => void;
     onUnlock(cb: () => void): () => void;
     onSuspend(cb: () => void): () => void;
     onResume(cb: () => void): () => void;
   }
   ```
2. Default-Implementierung `ElectronIdleTimeSource`:
   - `getIdleTimeMs()` liefert `powerMonitor.getSystemIdleTime() * 1000` (Electron gibt Sekunden zurück).
   - Event-Listener via `powerMonitor.on('lock-screen'/'unlock-screen'/'suspend'/'resume')`.
   - Wird erst **nach** `app.whenReady()` in `main.ts` instanziiert.
3. `PresenceMonitor` führt:
   - `localStatus` (persistiert)
   - `isAutoAway` (runtime-only)
   - `effectiveStatus` (derived)
   - Polling alle 30 Sekunden
   - Auto-Away nach 5 Minuten Idle
   - sofortiges `away` bei Lock/Suspend
4. Innerhalb von `app.whenReady()` instanziieren:
   ```ts
   const idleSource = new ElectronIdleTimeSource();
   const presenceMonitor = new PresenceMonitor({
     idleSource,
     identityStore,
     sessionStore,
     onStatusChange: (status) => {
       sessionStore.broadcastPresenceStatus?.(status);
     },
   });
   ```
5. Bei jeder Status-Änderung:
   - `sessionStore.setLocalPresenceStatus(effectiveStatus)`
   - `broadcastPresence(effectiveStatus)` über `GroupSession`.
6. `showNotchMessage(..., { silent: presenceMonitor.effectiveStatus !== 'online' })` aufrufen.
7. `registerSessionHandlers(appState, githubLoginService, presenceMonitor)` aufrufen.

### `apps/windows/src/main/session-handlers.ts`

1. Signatur erweitern:
   ```ts
   export function registerSessionHandlers(
     appState: AppState,
     githubLoginService: GitHubLoginService,
     presenceMonitor: PresenceMonitor,
   ): void
   ```
2. Handler `setPresenceStatus(status)` hinzufügen.
3. Weiterleiten an `presenceMonitor.chooseStatus(status)`.

### `apps/windows/src/main/preload.ts` + `apps/windows/src/shared/types.ts`

1. `IpcApi` erweitern um `setPresenceStatus(status: PresenceStatus): Promise<void>`.
2. Expose im Preload:
   ```ts
   setPresenceStatus: (status) => ipcRenderer.invoke('set-presence-status', status),
   ```
3. State-Update-Typen (`IdentityUpdate` / `StateUpdate`) um `presenceStatus` erweitern.

### `apps/windows/src/renderer/store/app-store.tsx`

1. `presenceStatus` und `effectiveStatus` im Store führen.
2. `setPresenceStatus(status)` Action.
3. Members mit Status exposen.

### `apps/windows/src/renderer/components/MenuWindow.tsx`

1. Status-Picker hinzufügen (Online, Do Not Disturb, Away).
   - Alle drei Zustände sind wählbar.
   - Wenn `effectiveStatus` `away` ist (auto-away), der Picker aber `online` zeigt, soll der Picker dennoch `online` anzeigen und ein zusätzlicher Indikator (z. B. Text „Away — auto") den Auto-Away-Zustand verdeutlichen.
   - Klick auf bereits gewählten `online` bei Auto-Away cleared `away` sofort (macOS-Parität).
2. Eigener Avatar mit Status-Dot.

### `apps/windows/src/renderer/components/Avatar.tsx`

1. Optionales `status?: PresenceStatus` Prop.
2. Optionales `imageURL?: string` Prop für `avatarURL`-Priorität (falls vorhanden, verwende URL statt inline `avatar`).
3. Farbiger Status-Dot unten rechts:
   - `online`: grün
   - `dnd`: orange
   - `away`: rot
4. Dot nur anzeigen, wenn `status` übergeben wird.
5. Status-Dot wird im eigenen Avatar in `MenuWindow` und optional auch in Member-Avataren in `CircleSection` gerendert (zuerst eigener Avatar).

### `apps/windows/src/renderer/components/NotchWidget.tsx` / `useNotchLifecycle.ts`

1. `showNotchMessage(data, { silent })` in `main.ts` übergibt `silent` an den Renderer.
2. `NotchMessage` bzw. `onNotchMessage` verarbeitet `silent`:
   - Neue eingehende Nachricht wird in `history` aufgenommen.
   - Bei `silent === true` wird keine automatische `full`-Phase gestartet.
   - Bei `silent === false` wird die Notch wie bisher in `full` geöffnet.
   - Der Sliver/Ring in `peek` darf weiterhin erscheinen, um anzuzeigen, dass etwas angekommen ist (macOS-Parität: `silent` unterdrückt nur den visuellen Preview, nicht den Badge/Ring).
3. Externes Reopen oder manuelles Öffnen zeigt weiterhin die History.

## Edge-Cases

1. **Unbekannter Status von älteren Peers:** decodiert als `online`.
2. **Auto-Away während DND:** `effectiveStatus` bleibt `dnd`, da `dnd !== online`.
3. **Status-Picker während Auto-Away:** Klick auf `online` cleared `away` sofort.
4. **Neue Nachricht bei DND/away:** Notch-Preview unterdrückt, aber Nachricht landet in History.
5. **Mehrere Displays / Sleep:** Auto-Away wird bei Sleep/Lock sofort gesetzt, auch wenn Idle-Timer noch nicht abgelaufen ist.
6. **Reply offen während Statuswechsel:** Reply bleibt sichtbar, nur neue eingehende Nachrichten werden still.

## Test-Strategie

### Automatisierte Tests

1. **Shared-Wire:**
   - Round-trip `profile` mit `status`.
   - Round-trip `presence`.
   - Fehlender/unbekannter Status → `online`.
2. **Main Process:**
   - `PresenceMonitor` mit `FakeIdleTimeSource` testen.
   - `effectiveStatus` Berechnung (online + autoAway = away, dnd + autoAway = dnd).
   - `chooseStatus('online')` cleared `isAutoAway`.
   - Sleep/Lock-Events setzen `away`; Wake/Unlock re-evaluieren Idle.
3. **Renderer:**
   - Status-Picker ruft `setPresenceStatus` auf.
   - Avatar rendert Dot je nach Status.
   - Notch unterdrückt Preview bei `dnd`/`away`.
4. **Integration:**
   - `group-session.ts` broadcastet `presence` bei Statuswechsel.
   - Empfangener `profile`/`presence` aktualisiert Member-Status.

### Manuelle QA

1. App starten, Status auf `dnd` stellen.
2. Nachricht von anderem Client → keine Notch-Preview.
3. Status auf `online`, 5 Minuten warten (oder Idle-Threshold testweise verkürzen) → `away`.
4. Lock/Screen-Off → sofort `away`.
5. Unlock/Screen-On → zurück zu `online`.
6. Anderer Client sieht Status-Änderung in Member-Liste.

## Risiken / Rückfalltrichten

| Risiko | Mitigation |
|--------|-----------|
| Wire-Protokoll-Änderung bricht macOS-Interoperabilität. | Status optional; unbekannte Werte → `online`; Tests gegen macOS-Round-Trip. |
| Idle-Detection auf Windows unzuverlässig. | Electron `powerMonitor.getSystemIdleTime()` verwenden; Win32-Fallback dokumentieren. |
| Auto-Away interferiert mit Präsentations-/Videomodus. | Zukünftig Display-Assertions nachrüsten; für MVP reiner Idle-Timer + Sleep/Lock. |
| UI wird überladen durch Status-Picker. | Kompaktes Dropdown in Settings-Popover; Status-Dot nur auf eigenem Avatar. |

## Definition of Done

- [x] `PresenceStatus` in shared-wire definiert.
- [x] `profile` und `presence` Payloads unterstützen Status.
- [x] Identity speichert und persistiert `presenceStatus`.
- [x] Main process berechnet `effectiveStatus` mit Auto-Away.
- [x] Sleep/Lock/Wake/Unlock-Events setzen/lösen `away` korrekt.
- [x] `group-session.ts` sendet/empfängt Status.
- [x] `MenuWindow` zeigt Status-Picker.
- [x] `Avatar` zeigt Status-Dot.
- [x] Notch-Preview wird bei `dnd`/`away` unterdrückt.
- [x] Tests grün (`bun run typecheck`, `bun test`).
- [ ] Manuelle QA auf Windows bestätigt das Verhalten.

## Commit-Nachricht

```
feat(windows): add presence status with auto-away and DND (iOS parity)

Implement online / do-not-disturb / away states matching macOS:
- Extend shared-wire profile/presence payloads with status.
- Persist chosen status in identity store.
- Auto-away after 5 min idle or on sleep/lock.
- Add status picker and avatar dot.
- Suppress notch preview when not online.
```
