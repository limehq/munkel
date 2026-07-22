# Internationalization

Munkel is an English-only product today. This document is deliberately honest
about that: **no non-English locale ships yet, and there is no translation
workflow in place.** What we have done is keep the codebase in a state where
localization is a tractable, additive change rather than a rewrite. This
document records that approach and what is still missing, so the gap is visible
rather than hidden. Internationalization work lives alongside other planned
work in [ROADMAP.md](../ROADMAP.md).

The two surfaces a user reads are the **website** (`munkel.app`) and the
**macOS app**. The relay and the `munkel` CLI have no graphical UI of their own;
the CLI's output is plain English text in the user's terminal.

## Current state at a glance

| Surface | Localizable today | Translations shipped | Notes |
| --- | --- | --- | --- |
| macOS app | Partially (strings are localizable primitives) | None | No `.xcstrings` catalog yet |
| Website | No (copy is hardcoded English JSX) | None | No i18n library yet |
| CLI | No | None | Plain English terminal output |

Everything below explains what "partially" means and where the line is.

## macOS app

Source: `apps/macos/Sources/MunkelApp` (SwiftUI + AppKit).

The UI is built from standard SwiftUI views — `Text`, `Label`, `Button`,
`Toggle`, and `.help(...)` — that take string literals. There are around 40 such
user-facing literals, concentrated in `MenuView.swift` (the menu-bar popover)
with a handful more in the notch views (`AuthCodeNotchView.swift`,
`MessageNotchContainer.swift`, `MessageNotchView.swift`) and the command palette
(`CommandPaletteView.swift`). Most notch content is the user's own message text,
which is not translatable copy.

Why this matters for localization:

- **String literals are localizable keys.** When you write `Text("Join")` or
  `Label("GitHub sign-in", systemImage: …)`, SwiftUI uses the
  `LocalizedStringKey` initializer for the literal automatically. These strings
  are therefore mechanically extractable into an Xcode String Catalog
  (`.xcstrings`) without code changes. The app does not use `Text(verbatim:)`
  anywhere, so no UI string is explicitly opted out of localization.
- **Dynamic strings use interpolation, not concatenation.** User-specific text
  is built with string interpolation that keeps a full sentence in one
  translatable unit — for example `Text("Signed in as \(model.displayName)
  (@\(login))")` in `MenuView.swift`, and the image-overflow badge
  `Text("+\(message.images.count - 3)")` in `MessageNotchContainer.swift`.
  Translators see the whole phrase, not glued-together fragments.
- **No locale-unsafe formatting in the UI.** Munkel is ephemeral: it shows no
  message history and no timestamps, so the UI layer
  (`apps/macos/Sources/MunkelApp`) has no hand-rolled `DateFormatter` or
  `String(format:)` calls. (The `MunkelKit` library does use
  `ISO8601DateFormatter` for wire serialization and `String(format: "%02x", …)`
  for hex encoding in `GroupKey.swift`; both are intentionally
  locale-independent machine formats, not user-facing text.) When user-facing
  formatting is eventually needed, it should use locale-aware system APIs.

What is **not** done:

- No String Catalog exists in source. `apps/macos/Package.swift` declares the
  app target's resources as `resources: [.process("Resources")]`; there is no
  `.xcstrings` file to populate yet.
- No non-English `.lproj`/catalog translations ship.
- Pluralization (e.g. "1 image" vs "2 images") and right-to-left (RTL) layout
  have not been audited or implemented.

## Website (munkel.app)

Source: `apps/landing` (TanStack Start, React, Tailwind v4).

What is in place:

- The document language is declared explicitly: the root document sets
  `<html lang="en">` in `src/routes/__root.tsx`. This is correct for the only
  language currently shipped and is the right starting point for adding more.

What is **not** done:

- There is no internationalization library in the project. `package.json`
  pulls in none of `i18next`, `react-intl`/`formatjs`, or `lingui`.
- All copy is hardcoded English JSX in the section components under
  `src/components/sections` (hero, features, CLI, FAQ, footer, and so on) and
  in the legal routes. Strings are not externalized into message catalogs.
- The `lang` attribute is a static literal, not driven by a locale.

Localizing the website would mean introducing a message-catalog approach,
extracting the hardcoded strings, and driving `lang` (and any future RTL
`dir`) from the active locale.

## CLI and relay

The `munkel` CLI (`apps/cli`) prints plain English status and error text to the
terminal; it has no localization layer. The relay (`apps/server`) has no
user-facing strings — it speaks the wire protocol defined in
`apps/server/src/protocol.ts` and is never read by an end user.

## What localizing Munkel would take

We have not committed to specific locales. The path, if and when we add one, is
additive:

1. **macOS app:** add an `.xcstrings` String Catalog to the app target, let
   Xcode extract the existing `LocalizedStringKey` literals, add per-language
   translations, and audit pluralization and RTL layout.
2. **Website:** adopt a message-catalog approach, extract the hardcoded JSX
   copy, and make `lang`/`dir` follow the active locale.
3. **CLI:** decide whether terminal output is worth localizing at all; agent
   and developer tooling output is often deliberately kept in English.

## Reporting and contributing

If the lack of a translation is a barrier for you, or you want to help with a
specific locale, please open an issue:
https://github.com/limehq/munkel/issues. Describe the surface (website, macOS
app, or CLI) and the language you need. See [CONTRIBUTING.md](../CONTRIBUTING.md)
for how to propose changes.

You can also reach the maintainers directly:

- Jurij Koch — jurij@uq.dev
- Sebil Satici — hallo@sebil.dev
