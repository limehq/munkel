# Windows notch UX — bug report (2026-06-30)

**Reporter:** User (manual QA)  
**Platform:** Windows client (`apps/windows`)  
**Branch at report time:** `platform/windows/v2-clean` (tip `14b9ffc` — historical; current tip is `f29c577`)  
**Status:** Partially fixed (2026-07-04) — WIN-NOTCH-002 merged via PR #22; WIN-NOTCH-003 addressed by Session 1 work; WIN-NOTCH-001 remains open.

## Summary

Three related issues block normal use when receiving a message on Windows:

| ID | Symptom | Severity |
|----|---------|----------|
| [WIN-NOTCH-001](#win-notch-001-notch-renders-oversized) | Notch notification appears much too large on screen | High |
| [WIN-NOTCH-002](#win-notch-002-message-history-not-shown) | Message history / conversation thread not visible | High |
| [WIN-NOTCH-003](#win-notch-003-reply-compose-and-send-broken) | Cannot type a reply; Send does not deliver | Critical |

These may share root causes (notch window sizing, focus model, missing macOS parity for history). Treat as one UX cluster until a tight repro loop splits them.

---

## Environment (to confirm during diagnosis)

| Field | Value |
|-------|-------|
| OS | Windows 10/11 (build TBD) |
| Display scaling | TBD — note % (likely relevant for WIN-NOTCH-001) |
| App build | Dev (`bun run dev`) or packaged installer — TBD |
| Circle / relay | TBD — online vs offline affects WIN-NOTCH-003 |

---

## WIN-NOTCH-001: Notch renders oversized

### Reported behavior

When a message arrives, the notch UI at the top of the screen is displayed **much larger than expected** — disproportionate to the compact teaser on macOS / landing demo.

### Expected behavior

Compact, top-center notification similar to macOS `MessageNotchView` teaser (~310 pt wide on landing; Windows spec uses 360 px content width).

### Actual behavior

Notch occupies excessive screen area (exact dimensions TBD — capture screenshot + window bounds during diagnosis).

### Suspected code areas

- `apps/windows/src/main/notch-window.ts` — fixed `NOTCH_WIDTH = 360`, `NOTCH_HEIGHT = 260`; no dynamic resize to content; no DPI-aware scaling.
- `apps/windows/src/renderer/styles/global.css` — `.notch-widget { width: 360px; … }` matches window width; padding/animation may visually enlarge beyond frame on some DPI settings.
- Electron `BrowserWindow` on Windows with `thickFrame: true`, `hasShadow: true` — frame/shadow may add perceived size.

### Status

**Open.** Sizing fixes were scoped out of PR #22 and remain the P1 track in IDEAS.md § Session 2. The 360×260 fixed window and lack of dynamic resize to content still need attention.

### Diagnosis notes (Phase 1 — pending)

- [ ] Capture `screen.getPrimaryDisplay().scaleFactor` and actual `BrowserWindow` bounds vs CSS layout box.
- [ ] Compare packaged vs dev; compare 100% vs 125%/150% display scaling.
- [ ] Screenshot overlay with expected macOS/landing dimensions for reference.

---

## WIN-NOTCH-002: Message history not shown

### Reported behavior

The **message history / conversation thread** is not displayed when the notch is open.

### Expected behavior (macOS reference)

macOS client keeps a **60-second RAM-only history** in the expanded notch (`NotchPresenter.historyWindow`, `MessageNotchContainer.history`). Prior messages in the window appear as scrollable/collapsible history rows below the current message. Landing page demo mirrors this (`nx-history` in `apps/landing`).

### Actual behavior (Windows)

Before PR #22, `NotchWidget.tsx` rendered **only the latest** `NotchMessage` from local state (`message`). No history list, no expand/collapse, no 60 s pruning appeared.

`app-store.tsx` accumulated `notchMessages[]` via `onNotchMessage`, but **NotchWidget did not consume that array** for display — only the most recent IPC update was shown.

### Classification

Likely **macOS parity gap** (missing feature) rather than a regression, unless Windows ui-spec explicitly promised history (it does not today). User impact is the same: expected product behavior from macOS/landing is absent.

### Status

**Fixed by PR #22** (`a72b456`, branch `platform/windows/notch-peek-history`) into `platform/windows/v2-clean`. The implementation adds a 60-second in-memory history buffer in the notch renderer, phase-based lifecycle (full → peek → retracted), hover-reopen, and pruning. Automated tests pass; manual live-animation QA is the remaining Plan 07 re-QA gate.

### Suspected code areas

- `apps/windows/src/renderer/components/NotchWidget.tsx` — single-message UI only.
- `apps/windows/src/renderer/store/app-store.tsx` — `notchMessages[]` unused by notch renderer.
- Reference: `apps/macos/Sources/MunkelApp/NotchPresenter.swift`, `MessageNotchContainer.swift`.

### Diagnosis notes (Phase 1 — pending)

- [ ] Confirm with product: ship 60 s history on Windows v1 or defer.
- [ ] If implementing: port history model + pruning timer from macOS; wire `notchMessages` or main-process history buffer.

---

## WIN-NOTCH-003: Reply compose and send broken

### Reported behavior

1. Clicking the message does **not** allow typing a reply in the field below.
2. Pressing **Send** does **not** deliver the message.

### Expected behavior (per `apps/windows/docs/ui-spec.md`)

- Explicit **Reply** button (↩) on the message row opens inline compose (row click alone does **not** open reply — Plan 01).
- `beginNotchReply` / `focusNotchForReply` makes the notch window focusable so the frosted input accepts keyboard input.
- `Enter` or ➤ calls `sendChat(group, text, to)`; failures show inline error (e.g. "Circle offline — reply not sent.").

### Actual behavior (user report)

- User expects click-on-message → compose (may be UX mismatch with Plan 01 explicit Reply button).
- Input field either not shown, not focusable, or keystrokes ignored.
- Send appears to no-op (no delivery; error visibility unknown).

### Status

**Addressed by Session 1 work** (IDEAS.md § Session 1): `broadcastState` now reaches `notchWindow`, `NotchMessage` carries `senderMemberId`, reply delivery is fail-closed, and the 80 ms focus delay was added. Code tasks are complete; final acceptance depends on the same manual QA cycle as Session 1.

### Hypotheses (unverified — for Phase 3)

1. **UX mismatch:** User clicks message body, not Reply button → compose never opens (`NotchWidget.tsx` lines 133–143).
2. **Focus regression:** Notch window created with `focusable: false`; `beginNotchReply` IPC not reached or `focus()` fails on Windows → input cannot receive keys (`notch-focus.ts`, `notch-window.ts`).
3. **Send path failure:** `sendChat` returns `{ ok: false }` (offline circle, member lookup miss for private reply) but error not noticed; or `lookupMemberId` fails silently and wrong `to` breaks delivery.
4. **Pointer events:** `.notch-widget` uses `pointer-events: none` until `.notch-visible` — race if visible class not applied.

### Suspected code areas

- `apps/windows/src/renderer/components/NotchWidget.tsx` — reply gating, `sendReply()`, `lookupMemberId()`.
- `apps/windows/src/main/notch-focus.ts` — `setFocusable(true)` + `focus()`.
- `apps/windows/src/main/main.ts` — IPC handlers `notch-begin-reply` / `notch-end-reply`.
- `apps/windows/src/main/session-handlers.ts` — `send-chat` IPC.
- `apps/windows/src/main/group-session.ts` — `sendChat()`.

### Diagnosis notes (Phase 1 — pending)

- [ ] Repro with explicit Reply button click vs message-row click; record which path user used.
- [ ] DevTools in notch window: verify `replying` state, input focused, `sendChat` IPC result.
- [ ] Confirm circle connected (`CircleState.connected`) at send time.
- [ ] Build automated repro: Playwright/Electron test that receives mock `notch-message`, opens reply, types, asserts `send-chat` invoked.

---

## Repro steps (user-provided, consolidated)

1. Join / stay in a circle with another client (or CLI) sending messages.
2. Receive an incoming message → notch appears at top of screen.
3. **Observe:** notch size (WIN-NOTCH-001).
4. **Observe:** no prior messages listed (WIN-NOTCH-002).
5. Click the message; attempt to type a reply below.
6. Click Send (or press Enter).
7. **Observe:** no text entry and/or no outbound message (WIN-NOTCH-003).

---

## Feedback loop status (diagnosing-bugs Phase 1)

**Not built yet.** No single command currently goes red on these symptoms. Recommended next step:

1. Manual HITL script with checklist above + screenshot capture.
2. Electron renderer test with mocked IPC for notch receive → reply → send-chat assertion.
3. Optional: extend `apps/windows/src/main/__tests__/group-session.test.ts` patterns for end-to-end notch reply.

Do **not** patch until a red-capable loop exists for at least WIN-NOTCH-003 (critical path).

---

## Related documentation

- [UI spec — Notch content](../../apps/windows/docs/ui-spec.md)
- [Plan 01 — Notch reply polish](../../apps/windows/docs/plans/01-notch-reply-polish.md)
- macOS history reference: `apps/macos/Sources/MunkelApp/NotchPresenter.swift`

---

## Investigation summary (2026-06-30)

Three parallel read-only code investigations completed. See consolidated plan in
agent chat / `docs/README.md#open-tasks`.

| ID | Root cause (confidence) | Fix track |
|----|-------------------------|-----------|
| WIN-NOTCH-001 | No teaser mode; fixed 360×260 window; dimension drift vs macOS (HIGH) | Shrink + dynamic resize |
| WIN-NOTCH-002 | Missing feature — history never implemented (HIGH) | **Fixed by PR #22** — renderer 60s history + phase lifecycle |
| WIN-NOTCH-003 | Multi-cause: UX mismatch + `broadcastState` skips notch + no `senderMemberId` + silent relay reject (HIGH) | **Addressed by Session 1 work** — pending manual QA |

---

## Changelog

| Date | Action |
|------|--------|
| 2026-06-30 | Initial report from user QA; filed by agent |
| 2026-06-30 | Root-cause investigation (3 sub-agents); consolidated findings |
| 2026-07-04 | WIN-NOTCH-002 fixed by PR #22 (`a72b456`); WIN-NOTCH-003 addressed by Session 1 work; WIN-NOTCH-001 remains open |
