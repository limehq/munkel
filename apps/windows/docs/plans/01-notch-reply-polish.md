# Plan 01: Notch reply UX polish

**Branch:** `platform/windows/notch-reply-polish`  
**Base:** `platform/windows/v2-clean` (after Phase 2 PR merged)  
**Estimate:** 1 session

## Problem

In `NotchWidget.tsx`, clicking the message row always calls `setReplying(true)`:

```90:90:apps/windows/src/renderer/components/NotchWidget.tsx
<div className="message-row" onClick={() => setReplying(true)}>
```

After a successful reply, `sendReply()` sets `setReplying(false)`, but clicking
the row again immediately re-opens the compose field. Users expect either an
explicit **Reply** affordance or auto-collapse with no accidental re-open.

## Goal

Match macOS notch reply ergonomics: deliberate reply action, no surprise
compose on passive row clicks after success.

## Out of scope

- Palette send UX changes
- New IPC channels
- Protocol / crypto changes
- GitHub OAuth

## Design decision (pick one — default: Option A)

### Option A — Explicit Reply button (recommended)

- Row click: **no longer** opens reply field
- Add a small Reply button (e.g. ↩ or "Reply") on the message row
- Copy button stays; both use `stopPropagation`
- Reply field opens only via Reply button

### Option B — Auto-collapse + debounced re-open

- Keep row click to open reply
- After successful send: collapse + set `repliedAt` timestamp
- Ignore row clicks for ~3s after success unless Reply clicked again

**Implement Option A unless product owner chooses B.**

## Tasks (sequential)

### Task 1 — Refactor click handlers

**Files:** `apps/windows/src/renderer/components/NotchWidget.tsx`

1. Remove `onClick={() => setReplying(true)}` from `.message-row`
2. Add Reply button with `onClick={(e) => { e.stopPropagation(); setReplying(true); }}`
3. Ensure copy button still works (`stopPropagation` already present)
4. Preserve `Escape` to close reply field
5. Preserve `onNotchMessage` reset (lines 28–32)

**Acceptance:** Clicking message body does not open reply; Reply button does.

### Task 2 — Styles

**Files:** `apps/windows/src/renderer/styles/global.css`

1. Add `.reply-button` consistent with `.copy-button` / `.icon-button`
2. Layout: Reply + Copy aligned on the right of message row
3. Hover/focus states match existing frosted UI

**Acceptance:** Visual parity with ui-spec.md notch section.

### Task 3 — Update documentation

**Files:**

- `apps/windows/docs/ui-spec.md` — replace "Clicking the message opens inline reply"
  with explicit Reply affordance description
- `apps/windows/README.md` — no change required unless UX bullet list mentions click-to-reply

**Acceptance:** Docs match implemented behavior.

### Task 4 — Manual verification

1. `bun run dev` from repo root
2. Trigger test notch or receive a message
3. Verify: row click ≠ reply open; Reply opens field; send success closes field;
   second row click still does not open; new incoming message resets state
4. Verify copy still works

**Acceptance:** Manual checklist passed; note findings in PR body.

### Task 5 — Automated checks

```bash
bun run typecheck --filter=@munkel/windows
bun run test --filter=@munkel/windows
```

Optional: add a lightweight renderer test if the project already has React
component tests (currently none — **do not** add test infra for this plan alone).

**Acceptance:** typecheck + tests green.

### Task 6 — PR

```bash
git push -u origin platform/windows/notch-reply-polish
gh pr create --repo rodgi040/munkel \
  --base platform/windows/v2-clean \
  --title "fix(windows): explicit notch reply affordance" \
  --body "..."
```

Do not self-merge unless explicitly asked.

## Definition of done

- [ ] Reply opens only via explicit control (Option A) or documented Option B
- [ ] ui-spec.md updated
- [ ] typecheck + tests green
- [ ] PR open to `platform/windows/v2-clean`
