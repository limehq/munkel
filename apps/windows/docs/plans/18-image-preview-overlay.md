# Plan 18: Image Preview Overlay / Lightbox

> **Status:** Implemented  
> **Branch:** `platform/windows/feature/image-preview-overlay`  
> **Base:** `platform/windows/feature/presence-status`  
> **Estimate:** 3 sessions  
> **Type:** Feature / iOS-Parity

## Problem

Windows zeigt im Notch nur kleine Inline-AVIF-Thumbnails (72×72 px). Ein Klick auf ein Thumbnail hat keinen Effekt. Es gibt keine Vollbild-Vorschau, keinen Lazy-Load des Originalbilds aus R2, keine Skalierung auf native Pixelgröße und keine Unterstützung für animierte Bilder. macOS bietet mit `ImagePreviewOverlay` und `AlbumCell` dagegen eine Hover-/Klick-Vorschau, R2-Lazy-Load, natürliche Skalierung mit Notch-Gutter und Animation.

## Goal

- Klick auf ein Thumbnail öffnet ein Overlay/Lightbox mit dem Full-Image.
- Full-Image wird bei Bedarf aus R2 geladen und mit `messageKey` entschlüsselt.
- Bild wird unter Beibehaltung des Seitenverhältnisses skaliert, maximal bis zur nativen Pixelgröße, mit einem Gutter für die Notch.
- Schließen durch Klick auf den dunklen Hintergrund oder `Escape`.
- Empfangene animierte GIFs (von macOS) spielen im Overlay ab.
- RAM-only Caching der geladenen Full-Images im Renderer, damit erneutes Öffnen nicht erneut lädt.
- Wire-Protokoll- und Krypto-Kompatibilität mit macOS bleibt erhalten.

## Root-Cause-Analyse

### 1. `IncomingImage` kennt kein MIME

`apps/windows/src/shared/types.ts` definiert `IncomingImage` nur mit `id`, `thumb`, `width`, `height`. Das `mime`-Feld aus `ImageItem` geht verloren, sodass animierte Bilder nicht erkannt werden können.

### 2. Kein Download- + Decrypt-Pfad für Blobs

`apps/windows/src/core/blob-upload.ts` bietet nur `uploadBlob`. Es gibt keine `downloadBlob`-Funktion, die von `<relay>/blob/<groupId>/<r2Key>` holt. Zwar existiert `openRaw` in `@munkel/shared-wire/crypto`, aber er wird nie für R2-Blobs aufgerufen.

### 3. Keine IPC-Oberfläche für Full-Images

`IpcApi` in `shared/types.ts` und `preload.ts` hat keinen Kanal, über den der Renderer ein Full-Image anfordern könnte.

### 4. `NotchWidget.tsx` blockiert Klicks absichtlich

In `NotchWidget.tsx` wird auf der Thumbnail-Reihe `onClick={(e) => e.stopPropagation()}` verwendet, damit das Thumbnail nicht die Reply-Funktion auslöst. Es gibt aber keinen eigenen Klick-Handler für die Vorschau.

### 5. Keine Overlay-Komponente / kein CSS

Es existiert weder eine React-Komponente für das Overlay noch entsprechende CSS-Klassen für Backdrop, zentrierte Karte, Spinner oder Fehlerzustand.

### 6. Notch-Fenster ist zu klein für ein großes Overlay

`notch-window.ts` erzeugt ein 360×260 px Fenster. Ein Overlay, das „fast den ganzen Bildschirm" füllt, erfordert eine temporäre Vergrößerung/Repositionierung des Fensters.

## Konkrete Änderungen

### `apps/windows/src/shared/types.ts`

1. `IncomingImage` um `mime` erweitert.
2. `IpcApi` um `fetchFullImage` und `notchSetPreviewMode` erweitert.

### `apps/windows/src/core/blob-upload.ts`

1. `DownloadResult`-Interface hinzugefügt.
2. `downloadBlob` implementiert: GET `<relay>/blob/<groupId>/<r2Key>`, 404-Fehlerbehandlung, Größenlimit.

### `apps/windows/src/main/group-session.ts`

1. `IncomingImage`-Mapping um `mime` erweitert.
2. Empfangene `ImageItem`s werden in `receivedImages` gespeichert.
3. `fetchFullImage(r2Key)` lädt und entschlüsselt Blobs.
4. `findImageMime(r2Key)` liefert das MIME für einen r2Key.

### `apps/windows/src/main/session-store.ts`

1. `fetchFullImage(code, r2Key)` als öffentliche Wrapper-Methode.

### `apps/windows/src/main/session-handlers.ts`

1. IPC-Handler `fetch-full-image` registriert, gibt Base64 zurück.

### `apps/windows/src/main/preload.ts`

1. `fetchFullImage` und `notchSetPreviewMode` exposen.

### `apps/windows/src/main/notch-window.ts`

1. `enterPreviewMode()` / `exitPreviewMode()` vergrößern das Fenster auf die Work-Area bzw. stellen die ursprünglichen Bounds wieder her.
2. `setFocusable(true/false)` und `setIgnoreMouseEvents(false/true)` werden entsprechend gesetzt.

### `apps/windows/src/renderer/components/NotchWidget.tsx`

1. State für das Overlay, Loading, Fehler und RAM-Cache.
2. Thumbnail-Klick öffnet die Vorschau.
3. `Escape`-Listener schließt das Overlay.
4. `useEffect` schließt das Overlay, wenn der History-Eintrag entfernt wird.
5. Overlay-Rendering mit Backdrop, Karte, Spinner, Fehler und Bild.

### `apps/windows/src/renderer/styles/global.css`

1. `--notch-gutter` definiert.
2. `.image-preview-overlay`, `.image-preview-backdrop`, `.image-preview-card`, `.image-preview-spinner`, `.image-preview-error` hinzugefügt.
3. `.image-preview-thumb` bekommt `cursor: zoom-in`.

### `apps/windows/src/main/main.ts`

1. `notch-set-preview-mode`-Handler registriert.
2. `before-quit` setzt den Preview-Modus zurück.

## Test-Strategie

### Automatisierte Tests

- `core/blob-upload.test.ts`: `downloadBlob` 200/404/Netzwerk/Too-Large.
- `bun run typecheck` grün.
- `bun test` für `apps/windows` und `packages/shared-wire` grün.

### Manuelle QA

1. Windows-App starten, Bild von macOS empfangen.
2. Auf Thumbnail klicken → Overlay öffnet sich, Bild skaliert, Backdrop dunkel.
3. `Escape` → Overlay schließt, Notch kehrt in den vorherigen Zustand zurück.
4. Klick außerhalb des Bildes (auf Backdrop) → Overlay schließt.
5. Animierendes GIF von macOS → GIF spielt im Overlay.
6. 404-Fall simulieren (z. B. altes Bild) → Fehler-Glyph.

## Definition of Done

- [x] `IncomingImage` enthält `mime`.
- [x] `downloadBlob` existiert und ist getestet.
- [x] `GroupSession.fetchFullImage` entschlüsselt R2-Blobs korrekt.
- [x] IPC `fetchFullImage` ist in Preload, `types.ts` und `session-handlers.ts` verankert.
- [x] Thumbnail-Klick öffnet Overlay.
- [x] Overlay zeigt Full-Image skaliert mit nativem Pixel-Limit und Notch-Gutter.
- [x] Schließen via Backdrop-Klick und `Escape`.
- [x] Empfangene GIFs spielen im Overlay ab.
- [x] Fehler- und Loading-Zustände sind visuell erkennbar.
- [x] `bun run typecheck` und `bun test` sind grün.
- [ ] Manuelle QA auf Windows bestätigt das Verhalten.

## Commit-Nachricht

```
feat(windows): add image preview overlay / lightbox (iOS parity)

- Preserve image MIME so received animated GIFs can play.
- Add R2 blob download + AES-GCM decrypt path for full-resolution images.
- Add IPC for renderer to request full images from the main process.
- Open a click-to-dismiss lightbox in the notch with backdrop scaling.
- Support Escape / click-outside close and native GIF animation.
```
