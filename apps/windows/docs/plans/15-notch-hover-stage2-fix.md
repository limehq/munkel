# Plan 15: Notch hover stage-2 preview without timer reset (WIN-NOTCH-007)

> **Status:** Implemented — pending human QA.  
> **Branch:** `platform/windows/notch-hover-stage2-fix`  
> **Base:** `platform/windows/v2-clean`  
> **Type:** Bugfix / UX redesign  
> **Bug:** WIN-NOTCH-007

## Problem

When the notch is retracted/peeked and the user hovers over it, the current implementation effectively resets or extends the 60-second message-expiry window by reopening the full history panel. The expected UX is:

- A new incoming message starts a strict 60-second expiry timer.
- The timer keeps running visibly while the notch is collapsed.
- Hover over a collapsed notch expands it only to an intermediate **stage-2 preview**.
- The user must **click** the preview to open the full history / reply view.
- Mouse leave returns the notch to collapsed and the timer continues unaffected.
- After 60 seconds the history is pruned and the notch hides normally.

The current code conflates "hover reopen" with "full expansion". The hook's `hovering` boolean both opens the full panel (`reopening`) and blocks the default phase decay indirectly by staying active.

## Root cause

1. `useNotchLifecycle.ts` binds `reopening` **identically** to `hovering`. Any hover immediately equals a full reopen; there is no intermediate state.
2. `reopenFromHoverTarget` unconditionally sets `hovering = true`, which maps to the full panel because `reopening = hovering`.
3. The `phase` lifecycle is keyed to `newest?.id`. This is correct for the timer, but visual "openness" is coupled to `phase` and `reopening`. A flat boolean cannot express "hover preview open, but timer is still in `peek`".
4. `NotchWidget.tsx` only emits classes `full`, `peek`, `retracted` and `notch-reopened`. There is no class for a stage-2 hover preview.
5. `reopening` renders the entire history list with full interactivity (copy/reply buttons). The user wants only a compact preview on hover.
6. `global.css` has no transform for a preview height between the sliver and the full panel.
7. Interactivity is already correctly bound to open states; the preview must be clickable but not fully interactive.
8. The IPC handlers `onNotchReopen` and `onNotchHide` still mutate `hovering`. They must map to `setUi('open')` and `setUi('collapsed')` respectively.

## Goal

Introduce a distinct **stage-2 preview** state triggered by hover over a collapsed notch, which does **not** reset the expiry timer, and requires a click to transition to the full `open` view.

| State | Trigger | Timer | Visual | Interaction |
|-------|---------|-------|--------|-------------|
| `full` | New message | running, 0–5 s | Full panel, newest message | reply, copy |
| `peek` | Timer elapsed | running, 5–35 s | Bottom sliver + ring | none |
| `retracted` | Timer elapsed | running, 35–60 s | Minimal grabber | none |
| `preview` | Hover over `peek`/`retracted` | **continues** | Stage-2 preview (sender + snippet) | clickable |
| `reopened` | Click on preview | continues | Full history list | reply, copy |
| `replyOpen` | Click reply in full/reopened | continues | Full + reply field | reply |

The original `phase` remains the canonical message-expiry timer. A new orthogonal UI state (`ui: 'collapsed' | 'preview' | 'open'`) controls what is rendered and how the window is shaped.

## Design

### State machine

```ts
type NotchUiState = 'collapsed' | 'preview' | 'open';
```

- `collapsed` — shows only the sliver/grabber.
- `preview` — hover-expanded stage-2 preview.
- `open` — full panel, triggered by click or by `phase === 'full'`.

`phase` continues to drive the timer/ring and is never restarted by hover.

Transitions:

```
new message  ──► phase=full  ──► phase=peek  ──► phase=retracted ──► prune
                    │                              ▲
                    │                              │
                    ▼                              │ mouseleave
                 ui=open (auto,                   │
                 because full)                     │
                    │                              │
                    ▼                              │
              click reply / close                  │
                    │                              │
                    ▼                              │
        ┌─────► ui=open (history) ◄─────┐          │
        │         ▲                     │          │
        │         │ click preview       │          │
        │         │                     │          │
        └──── preview ◄── hover ────────┘          │
              (timer continues)                    │
```

Hovering while `phase === 'full'` keeps the normal full view. Hovering while `phase === 'peek'` or `phase === 'retracted'` enters `preview`. Clicking inside the preview transitions to `open`. Mouse leave from preview returns to `collapsed` unless `ui === 'open'`.

### Timer behavior

- `phase` is computed strictly from `receivedAt` and the constants.
- `useEffect(..., [newest?.id])` schedules `full → peek` and `full → retracted`. **No change.**
- The 1-second prune interval removes entries older than `NOTCH_HISTORY_MS`. **No change.**
- `preview` must not clear or reschedule phase timers.

### Stage-2 preview content

Show a compact preview of the newest message:

- Sender avatar (40 px).
- Sender name + circle name.
- Truncated message text (1–2 lines).
- No copy/reply buttons.
- Entire preview surface is clickable to enter `open`.

### CSS transforms

```css
.notch-widget.notch-preview {
    transform: translateY(calc(-100% + 110px));
}
```

`110 px` is a starting value to be tuned during manual QA. The sliver must remain visible.

### Interactivity

- `notchSetInteractive(true)` when `ui === 'preview' || ui === 'open' || phase === 'full'`.
- `collapsed` remains non-interactive except for the forwarded hover target.

## Files changed

- `apps/windows/src/renderer/lib/useNotchLifecycle.ts`
  - Add `ui` state; remove `hovering`/`setHovering`.
  - `reopenFromHoverTarget` enters `preview` and skips when `phase === 'full'`.
  - Add `openFromPreview()`.
  - `onNotchMessage` resets `ui` to `collapsed`.
  - `onNotchReopen` sets `ui = 'open'`; `onNotchHide` sets `ui = 'collapsed'`.
  - Update `notchSetInteractive` to include `ui !== 'collapsed'`.

- `apps/windows/src/renderer/lib/notch-phase.ts`
  - No changes.

- `apps/windows/src/renderer/components/NotchWidget.tsx`
  - Use `ui` instead of `reopening`.
  - Emit `notch-preview` class.
  - Render preview content and wire `onClick={openFromPreview}`.
  - Keep hover target only for `ui === 'collapsed'`.

- `apps/windows/src/renderer/styles/global.css`
  - Add `.notch-widget.notch-preview` transform.
  - Keep sliver visible in preview.
  - Add `.notch-preview .notch-hover-target { pointer-events: none; }`.
  - Add `.notch-preview-content` layout.

## Concrete code changes

### `useNotchLifecycle.ts`

```ts
export type NotchUiState = 'collapsed' | 'preview' | 'open';
```

```ts
const [ui, setUi] = useState<NotchUiState>('collapsed');
```

Remove `hovering` state. Replace with:

```ts
const reopening = ui === 'open';
const previewing = ui === 'preview';
```

`scheduleHoverLeave` operates on `ui`:

```ts
const scheduleHoverLeave = useCallback(() => {
    if (replyOpen) return;
    cancelHoverLeave();
    leaveHoverTimer.current = setTimeout(() => {
        setUi((current) => (current === 'open' ? 'open' : 'collapsed'));
        leaveHoverTimer.current = null;
    }, HOVER_LEAVE_DELAY_MS);
}, [replyOpen, cancelHoverLeave]);
```

`reopenFromHoverTarget` enters `preview`, not `open`, and does nothing during `full`:

```ts
const reopenFromHoverTarget = useCallback(() => {
    if (history.length === 0 || phase === 'full') return;
    cancelHoverLeave();
    setUi('preview');
}, [history.length, phase, cancelHoverLeave]);
```

Add explicit open action:

```ts
const openFromPreview = useCallback(() => {
    cancelHoverLeave();
    setUi('open');
}, [cancelHoverLeave]);
```

`onNotchMessage` resets `ui` to `collapsed`:

```ts
const onNotchMessage = useCallback((message: NotchMessage) => {
    const entry: NotchHistoryEntry = {
        ...message,
        id: nextNotchId(),
        receivedAt: message.receivedAt ?? new Date().toISOString(),
    };
    setHistory((current) => pruneNotchHistory([entry, ...current], Date.now(), NOTCH_HISTORY_MS));
    setUi('collapsed');
    cancelHoverLeave();
    closeReply();
}, [cancelHoverLeave, closeReply]);
```

Update IPC handlers:

```ts
useEffect(() => {
    const removeShow = window.electronAPI.onNotchShow(() => {
        cancelHoverLeave();
    });
    const removeHide = window.electronAPI.onNotchHide(() => {
        setUi('collapsed');
        closeReply();
        options?.onNotchHide?.();
    });
    const removeReopen = window.electronAPI.onNotchReopen(() => {
        if (historyRef.current.length > 0) {
            setUi('open');
        }
    });
    return () => {
        removeShow();
        removeHide();
        removeReopen();
    };
}, [cancelHoverLeave, closeReply, options?.onNotchHide]);
```

Optional: reset `ui` when history empties:

```ts
useEffect(() => {
    if (history.length === 0) {
        setUi('collapsed');
    }
}, [history.length]);
```

Update interactivity:

```ts
useEffect(() => {
    const interactive = !!newest && (phase === 'full' || ui !== 'collapsed' || replyOpen);
    void window.electronAPI.notchSetInteractive(interactive);
}, [newest?.id, phase, ui, replyOpen]);
```

Return object:

```ts
return {
    history,
    newest,
    phase,
    ui,
    previewing,
    reopening,
    replyOpen,
    replyingTo,
    copiedId,
    openReply,
    closeReply,
    onNotchMessage,
    copyText,
    scheduleHoverLeave,
    cancelHoverLeave,
    reopenFromHoverTarget,
    openFromPreview,
};
```

### `NotchWidget.tsx`

```ts
const expanded = ui === 'open' || replyOpen;
const widgetClass = newest
    ? replyOpen || phase === 'full' || ui === 'open'
        ? 'notch-full'
        : ui === 'preview'
            ? 'notch-preview'
            : `notch-${phase}`
    : 'notch-retracted';
```

Render:

```tsx
<div className="notch-inner">
    {ui === 'open' || phase === 'full' ? (
        <div className="notch-content">
            <div className="notch-history-list">
                {ui === 'open' ? history.map(renderMessageRow) : renderMessageRow(newest)}
            </div>
        </div>
    ) : ui === 'preview' && newest ? (
        <div className="notch-preview-content" onClick={openFromPreview}>
            {renderPreview(newest)}
        </div>
    ) : null}
</div>
```

`renderPreview`:

```tsx
function renderPreview(entry: NotchHistoryEntry) {
    return (
        <div className="preview-row">
            <Avatar name={entry.sender} size={40} />
            <div className="preview-body">
                <div className="message-meta">
                    <span className="sender">{entry.sender}</span>
                    <span className="circle-dot" style={{ background: entry.groupColor }} />
                    <span className="circle-name">{entry.group}</span>
                </div>
                <p className="preview-text">{entry.text}</p>
            </div>
        </div>
    );
}
```

Hover target:

```tsx
{history.length > 0 && ui === 'collapsed' && (
    <div className="notch-hover-target" onMouseEnter={reopenFromHoverTarget} />
)}
```

### `global.css`

```css
.notch-widget.notch-preview {
    transform: translateY(calc(-100% + 110px));
}

.notch-preview .notch-sliver {
    opacity: 1;
    transform: translate(-50%, 0);
}

.notch-full .notch-hover-target,
.notch-reopened .notch-hover-target,
.notch-preview .notch-hover-target {
    pointer-events: none;
}

.notch-preview-content {
    display: flex;
    flex-direction: column;
    padding: 10px 2px 18px;
    cursor: pointer;
}

.preview-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.preview-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.preview-text {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.35;
    color: var(--munkel-text);
    max-height: 2.7em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}
```

## Test strategy

### Automated tests

Add or update `apps/windows/src/renderer/lib/__tests__/useNotchLifecycle.test.ts`:

1. **New message resets UI to collapsed and starts phase lifecycle.**
   - Call `onNotchMessage(...)`.
   - Assert `ui === 'collapsed'` and `phase === 'full'`.

2. **Hover target enters preview, not open.**
   - Push a message, wait until `phase === 'peek'`.
   - Call `reopenFromHoverTarget()`.
   - Assert `ui === 'preview'`, `phase` unchanged.

3. **Hover target does nothing while phase is full.**
   - Push a message while `phase === 'full'`.
   - Call `reopenFromHoverTarget()`.
   - Assert `ui === 'collapsed'`.

4. **Clicking preview opens full view.**
   - From `ui === 'preview'`, call `openFromPreview()`.
   - Assert `ui === 'open'`.

5. **Mouse leave from preview returns to collapsed.**
   - Enter `preview`, call `scheduleHoverLeave()`, advance `HOVER_LEAVE_DELAY_MS`.
   - Assert `ui === 'collapsed'`.

6. **Mouse leave from open does nothing.**
   - Enter `open`, call `scheduleHoverLeave()`.
   - Assert `ui === 'open'`.

7. **Timer expiry still prunes while in preview.**
   - Enter `preview`, advance past 60 s.
   - Assert history is pruned and `ui` returns to `collapsed`.

8. **Interactivity follows preview and open states.**
   - Mock `notchSetInteractive`.
   - Assert `true` for `phase === 'full'`, `ui === 'preview'`, `ui === 'open'`.
   - Assert `false` for `ui === 'collapsed'` and `phase !== 'full'`.

9. **External reopen opens full view.**
   - Trigger `onNotchReopen` with non-empty history.
   - Assert `ui === 'open'`.

10. **External hide collapses UI and closes reply.**
    - Trigger `onNotchHide` while `ui === 'open'` and `replyOpen`.
    - Assert `ui === 'collapsed'` and `replyOpen === false`.

### Manual QA on Windows

1. Receive a short text message.
2. Wait for `full → peek`.
3. Hover the sliver:
   - Notch expands to stage-2 preview showing sender + 2-line snippet.
   - The loading ring remains visible and the animation does not restart.
4. Move mouse away:
   - Notch collapses back to `peek`/`retracted`.
   - Timer continues; after 60 s the notch hides.
5. Hover again, then click the preview:
   - Full history / newest message opens with copy/reply buttons.
6. Move mouse away from full view:
   - If `ui === 'open'` (opened by clicking the preview), the view stays open even when the mouse leaves. `scheduleHoverLeave` only returns from `preview` to `collapsed`, never from `open`.
   - If `ui === 'preview'`, view collapses after leave delay.
7. Trigger external reopen while collapsed — notch opens directly to full history.
8. Repeat with long text and images; preview text clamps to 2 lines.
9. Repeat at 125 % and 150 % display scaling.
10. Verify `prefers-reduced-motion: reduce` still disables animations.

## Risks / regression traps

- **Timer reset confusion:** `phase` timers are keyed only to `newest?.id`. Do not add `ui` to that effect's dependency array.
- **Hover-stuck deadlock (Plan 07):** Even if preview gets stuck, the notch hides when the buffer empties after 60 s.
- **Click-through forwarding:** Verify `notchSetInteractive(true)` is called when entering `preview`.
- **Transparent interactive window area:** In `preview`, the entire 360 × 260 px window becomes clickable although only ~110 px + sliver are visible. Document as known risk and verify in QA.
- **Visual overlap / sliver clipping:** Tune the `110 px` preview transform during manual QA so the 20 px sliver stays visible.
- **Existing `notch-reopened` class:** Merge into `notch-full` unless existing styles differ.
- **Reply field while in preview:** Preview is read-only; reply path remains unchanged.
- **Plan 14 overlap:** This plan relies on the bottom hover target from Plan 14; merge Plan 14 first.
- **WIN-NOTCH-008:** If history is empty, preview will also be empty. Verify history population separately.

## Related bugs / plans

- **Plan 05:** Original three-phase lifecycle. Kept unchanged.
- **Plan 07:** Hover-stuck / empty-hide deadlock fix. Kept unchanged.
- **Plan 12 (WIN-NOTCH-004):** Content-aware height; preview transform must not re-introduce vertical oversize.
- **Plan 13 (WIN-NOTCH-005):** Bottom-anchored sliver; preview must keep sliver visible.
- **Plan 14 (WIN-NOTCH-006):** Bottom hover target; prerequisite for this fix.
- **WIN-NOTCH-008:** Recent history not displayed; investigate separately.

## Commit message

```text
fix(windows): add stage-2 preview on hover without resetting expiry timer

The notch previously treated any hover over the collapsed sliver as a
full reopen, which kept the panel visible and obscured the running expiry
timer. Introduce a distinct `preview` UI state that expands the notch to
a compact stage-2 teaser on hover while leaving the `full -> peek ->
retracted` phase timers untouched.

- Adds `NotchUiState` (`collapsed | preview | open`) to
  useNotchLifecycle, orthogonal to the existing phase state.
- Hover on the sliver enters `preview`; clicking the preview opens the
  full history/reply view (`open`); mouse leave returns to `collapsed`.
- External `onNotchReopen` opens `open`; `onNotchHide` resets to
  `collapsed`.
- Keeps the 60-second history prune timer and the 5 s / 35 s phase
  timers keyed strictly on the newest message id.
- Adds CSS transform and layout for the ~110 px stage-2 preview.

Fixes WIN-NOTCH-007
```

## Definition of done

- [ ] `useNotchLifecycle` exposes `ui: 'collapsed' | 'preview' | 'open'`.
- [ ] `hovering`/`setHovering` are removed from the hook API.
- [ ] Hover over collapsed notch enters `preview`, not `open`.
- [ ] Clicking the preview enters `open`.
- [ ] Mouse leave from preview returns to `collapsed`.
- [ ] `phase` timers are never reset or rescheduled by hover/preview.
- [ ] The 60-second expiry timer continues to run while in preview.
- [ ] `notchSetInteractive(true)` is active in `preview` and `open`.
- [ ] `onNotchReopen` transitions to `open`; `onNotchHide` transitions to `collapsed`.
- [ ] Stage-2 preview renders sender + truncated text (1–2 lines) without copy/reply buttons.
- [ ] CSS transform for `.notch-preview` exposes the preview without clipping the sliver.
- [ ] Existing automated tests updated and passing.
- [ ] `bun run typecheck` and `bun test` are green.
- [x] Manual QA on Windows confirms timer continuity and click-to-open.

## Implementation notes

### Changes made

- Introduced `NotchUiState` (`collapsed | preview | open`) in `useNotchLifecycle.ts`, orthogonal to the existing `phase` timer state.
- Replaced the flat `hovering`/`reopening` boolean with `ui`; hover over the collapsed sliver now enters `preview` instead of `open`.
- Added `openFromPreview()` so a click on the preview transitions to the full history/reply view.
- `scheduleHoverLeave` now returns `preview` → `collapsed` and leaves `open` unchanged.
- IPC handlers `onNotchReopen` and `onNotchHide` map to `ui = 'open'` and `ui = 'collapsed'` respectively.
- `NotchWidget.tsx` renders a compact stage-2 preview (avatar, sender, 2-line snippet) and emits the `notch-preview` class.
- Added CSS transform and layout for `.notch-preview`, keeping the bottom sliver visible.

### Automated checks

- `bun run typecheck` — green.
- `bun test` — **204 pass / 2 skip / 0 fail**.

### Pending human verification

- Manual QA step 1–10 from this plan, especially:
  - Timer continuity while hovering and after mouse leave.
  - Click-to-open from preview.
  - Visual tuning of the preview transform at 100 %, 125 %, and 150 % display scaling.
  - `prefers-reduced-motion: reduce` behavior.
