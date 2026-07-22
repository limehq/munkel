# Accessibility

Munkel should be usable by people who rely on assistive technology. We treat
accessibility as a real, ongoing part of the work, not a one-time checkbox:
new UI is expected to be keyboard-operable, legible, and labelled for screen
readers, and accessibility regressions are treated as bugs.

This document is deliberately honest about the current state. Conformance is a
goal we have partially met. Where a surface falls short today, we say so and
track the work rather than overclaim. Accessibility items live alongside other
planned work in [ROADMAP.md](../ROADMAP.md).

The two surfaces a user interacts with directly are the **website**
(`munkel.app`) and the **macOS app**. The relay and CLI have no graphical UI;
the CLI's accessibility is the accessibility of the user's terminal.

## Website (munkel.app)

Source: `apps/landing` (TanStack Start, React, Tailwind v4).

Target: **WCAG 2.1 AA**. The landing page is built with accessibility in mind
and the following practices are in place today:

- **Semantic HTML.** The page uses landmark and sectioning elements rather than
  generic containers: `<nav>` for navigation, `<header>` for the hero, `<section>`
  for each content block, and `<footer>` for the footer. Content sections carry a
  stable `id` and a single `<h2>`; the hero carries the page's one `<h1>`.
  Legal pages (privacy, imprint, contact) render their content inside `<main>`.
- **Accessible interactive primitives.** The FAQ and tabbed regions use Radix UI
  primitives (`@radix-ui/react-accordion` and `@radix-ui/react-tabs`), which ship
  correct ARIA roles, state, and keyboard interaction (arrow keys, `Enter`/`Space`,
  focus management) out of the box.
- **Labels for icon-only controls.** Buttons and links that show only an icon
  carry an explicit `aria-label` (for example the GitHub link, the download link,
  the theme toggle, and the copy-to-clipboard buttons). Decorative icons are
  marked `aria-hidden` so they are skipped by screen readers.
- **Image alt text.** Decorative images (avatar montages, app icon, mockup
  chrome) use `alt=""` so they are ignored; images that carry meaning (the
  "featured on" launch badges) have descriptive `alt` text. The Open Graph share
  image also has an `og:image:alt` description.
- **Visible focus.** The shared button uses a `focus-visible` ring
  (`focus-visible:ring-2`) so keyboard users get a clear focus indicator without
  imposing an outline on mouse users.
- **`prefers-reduced-motion`.** Motion is gated on the user's preference at
  several layers: the landing page is wrapped in Motion's
  `MotionConfig reducedMotion="user"`, the hero scroll choreography checks
  `useReducedMotion()`, the CLI demo checks
  `matchMedia('(prefers-reduced-motion: reduce)')`, and a
  `@media (prefers-reduced-motion: reduce)` CSS block disables the remaining
  animations (pulse/cursor, notch transitions, accordion easing, and the badge
  marquee).
- **Themes and contrast.** A dark (default) and light theme are both provided.
  Colours are defined as design tokens, which makes contrast auditing and
  adjustment straightforward.

**Honest current status / what is tracked:**

- The landing route does not yet expose a top-level `<main>` landmark or a
  "skip to content" link. Sections are not wired to their headings with
  `aria-labelledby`. These are tracked improvements.
- We have not yet run a formal automated audit (for example axe or Lighthouse)
  in CI, nor a full manual screen-reader pass, so AA conformance is asserted by
  construction and review rather than verified end to end. Adding an automated
  accessibility check to CI is on the roadmap.
- Colour contrast has been chosen with care but has not been exhaustively
  measured against every token pair in both themes.

## macOS app

Source: `apps/macos/Sources/MunkelApp` (SwiftUI + AppKit). The two main UI
surfaces are the **menu-bar popover** (`MenuView`) and the **notch panel**
(the sliding `NotchPanel` that shows incoming messages and login codes).

What exists today:

- **Native, labelled controls in the menu.** The popover is built from standard
  SwiftUI controls. Text buttons (`Button("Join")`, `Button("Sign out")`,
  `Button("Retry")`, and so on) expose their label to VoiceOver automatically.
  Icon and status controls carry `.help(...)` tooltips ("Settings", "Copy code",
  "Leave channel", "Connected"/"Connecting…", "Roll a random code", "Remove"),
  which surface as VoiceOver help and as hover tooltips.
- **Menu-bar item label.** The status-item glyph sets
  `accessibilityDescription = "Munkel"` so the menu-bar control is identified.
- **Keyboard access.** Standard AppKit/SwiftUI controls are reachable with the
  system's keyboard navigation. The app also registers a global keyboard
  shortcut (⌃⌘M by default, user-rebindable from the menu) that opens the
  quick-send palette.
- **Contrast and theme.** The UI uses system materials and semantic colours and
  follows the active light/dark appearance.

**Honest current status / known gaps (tracked):**

- **Dynamic Type is not yet supported.** Most text in the notch and popover uses
  fixed point sizes (`.font(.system(size: …))`) rather than scalable text styles,
  so it does not grow with the user's preferred text size. Migrating to semantic
  text styles (or `@ScaledMetric`) is tracked. A few views already use semantic
  styles (`.title2`, `.subheadline`, `.caption`).
- **VoiceOver labels are incomplete.** The app does not yet set any explicit
  `accessibilityLabel`/`accessibilityValue` annotations: menu controls rely on
  their text labels or `.help(...)` tooltips, and the notch panel deliberately
  uses **no** `.help(...)` at all. That last choice is a privacy/security
  constraint, not an oversight: the notch is excluded from screen capture
  (`NSWindow.sharingType = .none`, see `CaptureExclusion.swift`), and AppKit
  draws tooltips in a separate, non-excluded window that would leak message
  content into a screen share. The notch therefore needs proper in-view
  `accessibilityLabel`/`accessibilityValue` annotations rather than tooltips,
  and that work is pending.
- **Reduce Motion is not yet honoured.** The notch open/close and expand
  transitions are spring animations that always run; the app does not currently
  read the system "Reduce Motion" setting
  (`accessibilityDisplayShouldReduceMotion`). Respecting it is tracked.
- We have not completed a full VoiceOver walkthrough of every state, so VoiceOver
  support should be considered partial.

## Project spaces

The places where people read about, discuss, and contribute to Munkel use
accessible formats and tooling:

- **Repository documentation** (this file, `README.md`, `SECURITY.md`,
  `PRIVACY.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, and the rest) is plain
  GitHub-flavored Markdown: heading-structured, link-text-bearing, and readable
  as source or rendered HTML by a screen reader.
- **Issues, pull requests, discussions, and code review** happen through
  GitHub's web UI, which is maintained against its own accessibility standards.
  We do not introduce a separate, less-accessible tracker.
- **Releases and the changelog** are likewise plain Markdown
  (`CHANGELOG.md`, GitHub Releases).

## Known gaps & how to report

Conformance is a goal we have partially reached. The concrete gaps we already
know about:

- Website: no `<main>` landmark or skip link on the landing route; no automated
  accessibility check in CI; no full screen-reader audit; contrast not
  exhaustively measured.
- macOS app: no Dynamic Type scaling; incomplete VoiceOver labels (especially in
  the notch); system "Reduce Motion" not yet honoured for notch animations.

These are tracked in [ROADMAP.md](../ROADMAP.md).

If you hit an accessibility barrier we have not listed — a control your screen
reader cannot name, text that will not scale, motion that cannot be turned off,
insufficient contrast, or anything else — please tell us. **Open an issue:**
https://github.com/limehq/munkel/issues. Describe the surface (website or app),
the assistive technology and OS version, and what you expected. Accessibility
reports are welcome and are treated as bugs.

You can also reach the maintainers directly:

- Jurij Koch — jurij@uq.dev
- Sebil Satici — hallo@sebil.dev
