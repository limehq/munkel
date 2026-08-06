# Handoff — munkel (2026-07-22)

## current_state

- **Branch:** `platform/windows/v2-clean` (synced with `platform/windows-integration` + `upstream/main`).
- **Contribution PR:** https://github.com/limehq/munkel/pull/80 — **MERGEABLE** (may be BLOCKED on reviews/checks).
- **Focus:** Windows contribution ready for upstream review.

## completed

1. Merged remaining feature branches into `v2-clean` (macos-parity-p1, startup-perf, lifecycle harden, prior security/docs/fixes).
2. Created `platform/windows-integration`, merged `upstream/main`, resolved conflicts.
3. Pushed `v2-clean` + `windows-integration` + feature tags; PR #80 tip refreshed → mergeable.
4. Fork PRs #41–#44 already merged into `v2-clean`.

## remaining

1. Human review / CI gates on limehq/munkel#80 (do not self-merge upstream).
2. Notch Aufgabe 2: sender shows IDs instead of display names.
3. Notch Aufgabe 3: own sent reply missing from notch history.
4. Optional: live Windows QA for notch hover → leave → retract.

## next_action

Wait for upstream review on PR #80, or start Notch Aufgabe 2 (sender display names) on a new feature sub-branch off `v2-clean`.
