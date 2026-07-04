# Plan 07: Notch Auto-Retract / Auto-Dismiss — Verify-First, then Fix

**Branch:** `platform/windows/notch-retract-fix` (only if Phase 0 reproduces a bug)
**Base:** `platform/windows/v2-clean`
**Type:** Verification → conditional Bugfix

> **Provenance:** Kimi (k2.6) produced a debug draft; orchestrator arbitrated it
> against the real code and git history and **reframed it as verify-first**. The
> two-Kimi adversarial critique is intentionally **deferred** until Phase 0
> confirms the bug still reproduces on the merged build (user decision
> 2026-07-04: "Re-QA zuerst").

## ⚠️ Why this is verify-first, not a fix

The bug "messages don't disappear / retract sequence missing" was reported
**2026-07-03**. But the retract/peek/60s-history feature (Plan 05 / PR #22) was
merged into `v2-clean` only **2026-07-04 11:28** (`a72b456`) — *after* the report
— and there are **no notch commits after the merge**. The user most likely
observed **pre-merge** behavior (the feature was literally absent).

Static reading of the now-merged code shows the lifecycle is **correctly wired**:

- Phase advances via two `setTimeout`s per message: `full` → `peek` at 5s →
  `retracted` at 35s (`NotchWidget.tsx:132-141`).
- CSS transforms slide the pill out of view for peek/retracted
  (`global.css:463-474`: `notch-peek` = `translateY(calc(-100% + 18px))`,
  `notch-retracted` = `translateY(calc(-100% + 8px))`).
- Disappearance chain: 1s prune interval (`NotchWidget.tsx:143-151`) drops entries
  older than 60s → `newest = history[0]` becomes `null` (`:48`) → empty effect
  fires `notchEmpty()` after 350ms when `history.length === 0 && !hovering`
  (`:158-164`) → main `requestNotchHide` → `win.hide()` after 250ms
  (`notch-window.ts:68-78`).

**Conclusion:** the bug is likely **stale**. Do not implement any fix until a
fresh re-QA on the merged build proves it still fails. This follows the CLAUDE.md
rule "reproduce with fresh evidence before patching."

## Phase 0 — Re-QA gate (MANDATORY, blocks everything below)

**Preconditions:** exactly ONE instance running (kill stray `electron.exe` first —
see HANDOFF), current `v2-clean` tip.

**Steps:**
1. Start the app: Start-Menu "Munkel" launcher, or `cd apps/windows && bun run dev`.
2. Trigger the notch: Tray → **test notch** (`runNotchDemo`, 3 staggered demo
   messages) **and** a real incoming message (second instance / CLI / relay).
3. Observe the newest message through the full lifecycle and note where it deviates:

| Expected | Time | Observe |
|----------|------|---------|
| **FULL** (full pill) | 0–5s | appears at full height |
| **PEEK** (slides up, ~18px sliver + white ring draining) | 5–35s | does it slide up? does the ring drain? |
| **RETRACTED** (~8px sliver) | 35–60s | does it shrink to a sliver? |
| **GONE** (window hidden) | ~60s | does it fully disappear? |
| **Hover-reopen** | anytime <60s | hovering the sliver reopens the 60s history |

**Decision:**
- **Works** (FULL→PEEK→RETRACTED→gone) → mark the IDEAS bug **fixed by PR #22**,
  close this plan as "verified, no fix needed." Done.
- **Still fails** → record *exactly which step* fails, then proceed to Phase 1
  with that evidence (this is what selects the real root cause below).

## Phase 1 — IF it still fails: instrument, then fix (conditional)

### Ranked hypotheses (do NOT assume — Phase 0 evidence picks the winner)

The failure step from Phase 0 maps to a hypothesis:

- **Stays FULL, never slides up** → phase timers not firing. Causes: StrictMode
  double-invoke clearing timers, or `newest?.id` churn re-running the effect
  (`NotchWidget.tsx:141` dep). *Fix direction:* replace the two `setTimeout`s with
  an elapsed-time tick using the **currently-unused** `notchPhaseForElapsed()`
  (`notch-phase.ts:9-12`) — robust against churn/StrictMode. (Kimi's H1/Fix A.)
- **Retracts but never fully hides** → the hide chain breaks. Prime suspect:
  **`hovering` stuck `true`** (Windows: with `focusable:false` +
  `setIgnoreMouseEvents(true, {forward:true})` in retracted, mouseleave may not
  fire) → `notchEmpty` never sent (`:159`) → window never hides. Investigate the
  hover enter/leave + `onNotchReopen` cursor-polling path. (Kimi's H3, sharpened.)
- **Ring resets on hover** → the CSS `notch-ring-drain` animation restarts on
  remount (`global.css:549-564`; ring only renders `phase==='peek' && !expanded`,
  `NotchWidget.tsx:382`). *Fix direction:* React-driven `strokeDashoffset` bound to
  elapsed time. (Kimi's H2/Fix B.) — visual only, not the "doesn't disappear" cause.
- **Ruled out by static analysis:** duplicate `onNotchMessage` listeners (only one,
  `NotchWidget.tsx:97`; `app-store.tsx` registers none); demo-vs-real path
  divergence (both go through `showNotchMessage`, `main.ts`).

### Instrumentation (temporary, do NOT commit)

- `NotchWidget.tsx`: log `newest?.id`, `phase`, `history.length`, `hovering`,
  `replyOpen` on change.
- `notch-window.ts`: log `showNotch` / `requestNotchHide` entry.
- `group-session.ts` / `main.ts` demo path: log `receivedAt` to confirm valid ISO
  (invalid → `Date.parse` NaN → prune misbehaves).

### Fix candidates (implement only the one Phase 0/instrumentation confirms)

- **Fix A — elapsed-time phase tick** (`notch-phase.ts` `notchPhaseForElapsed`,
  `setInterval` ~250ms, deps `[newest?.id]`). Retires the dead pure function.
- **Fix B — React-driven ring** (`strokeDashoffset` from elapsed peek time; drop
  the CSS keyframe). Depends on Fix A's tick.
- **Fix C — hover-stuck guard** (only if hide-chain break confirmed): ensure
  `hovering` resets reliably on Windows click-through; consider a max-hover
  safety timeout or driving empty off `newest` rather than `hovering`.
- **Fix D — demo `receivedAt` per-send** (`main.ts` `runNotchDemo`): set
  `receivedAt` when each staggered message is sent, not at array build time — so
  demo messages don't all prune simultaneously (QA clarity only).

## Files involved

- `apps/windows/src/renderer/components/NotchWidget.tsx`
- `apps/windows/src/renderer/lib/notch-phase.ts` (currently unused in renderer)
- `apps/windows/src/renderer/lib/prune-notch-history.ts`
- `apps/windows/src/main/notch-window.ts`, `apps/windows/src/main/main.ts`
- `apps/windows/src/renderer/styles/global.css` (ring)
- `apps/windows/src/renderer/lib/__tests__/notch-phase.test.ts`

## Verification (if a fix is implemented)

```bash
cd apps/windows
bun run typecheck
bun test
```
Then re-run the Phase 0 QA table and confirm FULL→PEEK→RETRACTED→gone for both
demo and real messages.

## Definition of done

- [ ] Phase 0 re-QA performed on the merged build; result recorded.
- [ ] If it works → IDEAS bug marked fixed by PR #22; no code change.
- [ ] If it fails → confirmed root cause (with instrumentation evidence), targeted
      fix, `notch-phase.ts` no longer dead code if Fix A applied, typecheck+tests green.

## Open questions (only relevant if a fix is needed)

1. Tick interval 250ms (smooth ring) vs 1s (fewer re-renders)?
2. `prefers-reduced-motion`: hide ring vs static half-circle?
3. Two-Kimi adversarial critique of the *fix* plan — run it once Phase 0 confirms
   a real bug and a specific hypothesis?
