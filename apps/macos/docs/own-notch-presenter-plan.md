# NotchPanel — in-house notch component (drop-in replace DynamicNotchKit)

Branch: `worktree-own-notch-presenter`. A **technical component** that drop-in
replaces DynamicNotchKit. No dependency, no `import`, no copied source, no comment
references. App/message logic is **out of scope** and untouched.

## Scope

In: a message-agnostic notch panel that hosts arbitrary SwiftUI content under the
hardware notch and animates open/closed — exactly the library's role, nothing more.

Out (STAYS in the app, unchanged): serialization (`showGeneration`/`pendingShow`),
60s history + pruning, reply flow, hide-timing policy, hover→expand/hide *decisions*,
all click handling, content morph, root `CaptureExclusion`. The component only hosts
content, animates, and **publishes `isHovering`** — the app owns all meaning.

## Why (verified vs lib source @ 1.1.0, 1616 LOC MIT)

- Coupling lives in **one file** (`NotchPresenter.swift`). Lib never sets
  `sharingType` → panel capturable; rebuilt capturable on every screen change →
  app pays a 4-pass timed re-assert (a race). Our core promise (no capture leak)
  hangs on an axis the lib fights us on.
- `expand(on:)` hardcodes `NSScreen.screens[0]`.
- Hover is plain SwiftUI `.onHover`, no `NSTrackingArea` — trivial to own.

## Component: `NotchPanel<Content>`

Inline files in the `munkel` target under `Sources/MunkelApp/NotchPanel/`:

| File | Responsibility |
|---|---|
| `NotchPanel.swift` | Public `@MainActor final class NotchPanel<Content: View>: ObservableObject`. Holds `transitionConfiguration`, `@Published private(set) isHovering`, hover/content/targetScreen closures, long-lived window ref, state. `expand()`/`hide()` async state machine (ported from `_expand`/`_hide` minus compact/namespace/haptics/increaseShadow/**keepVisible-defer**). Owns the screen-change observer. Exposes `panel`. Nested `HoverBehavior`, `TransitionConfiguration`. |
| `NotchPanelWindow.swift` | `final class NotchPanelWindow: NSPanel` (~35 LOC). `[.borderless,.nonactivatingPanel]`, `hasShadow=false`, clear bg, `isOpaque=false`, `level=.screenSaver`, `collectionBehavior=[.canJoinAllSpaces,.stationary]`, `canBecomeKey→true`. **The fix:** one `applyCaptureExclusion()` sets `sharingType=.none`, called from `init` + every re-host path. |
| `NotchScreenMetrics.swift` | Pure measurement + placement geometry, ported from `NSScreen+Extensions`: `hasNotch`, `notchSize` (`safeAreaInsets.top` + `auxiliaryTopLeft/RightArea`), `menubarHeight`, top-center frame math. `metrics(for:)` is the app-facing entry — **subsumes** `hardwareNotchSize()`, so placement and content layout key off ONE measurement (no multi-display drift). |
| `NotchHostingContent.swift` | Internal SwiftUI root (NotchView+NotchlessView+NotchShape merged). Notch path: black `NotchShape` mask + black fill (padded −50), caller `Content` pinned below cutout via top `safeAreaInset == notchSize.height`, `.onHover` over shape+cutout. Notchless path: rounded `VisualEffectView` pill sliding from top. Embeds `Content` **directly** (no lazy branch) so the app's root `CaptureExclusion` mounts in the same pass — guard with comment + assert. |

## Public API (drop-in contract)

```swift
final class NotchPanel<Content: View>: ObservableObject
init(hoverBehavior: HoverBehavior = .all,
     targetScreen: @escaping @MainActor () -> NSScreen? = { NSScreen.main },
     @ViewBuilder content: @escaping () -> Content)
enum HoverBehavior: Sendable { case all; case none }   // .all = publish isHovering over whole shape+cutout
struct TransitionConfiguration: Sendable {              // same nested-init shape as the lib
  var openingAnimation: Animation; var skipIntermediateHides: Bool
  init(openingAnimation: Animation = .spring(response: 0.6, dampingFraction: 0.7),
       skipIntermediateHides: Bool = true)              // defaults = decision 5
}
var transitionConfiguration: TransitionConfiguration
@Published private(set) var isHovering: Bool            // $isHovering Combine publisher, .onHover-driven
func expand() async                                     // resolves targetScreen, builds-or-repositions, fades in; ~0.4s settle
func hide() async                                       // collapses WHEN CALLED (no keepVisible-defer); panel reused, not deinit'd
var panel: NSPanel? { get }                             // replaces windowController?.window; nil before first expand

enum NotchScreenMetrics {
  static func metrics(for screen: NSScreen?) -> (notchSize: CGSize, hasNotch: Bool, menubarHeight: CGFloat)
}
```

Deliberate deviations from a literal mirror: drop the two vestigial `Expanded/Compact`
generics (`NotchPanel<Content>`); long-lived **repositioned** panel (stable identity
for `event.window === panel` + makeKey); `panel` typed accessor instead of
`windowController?.window`.

## Capture exclusion (2 layers — component never weakens the app's)

- **Layer 1 (app, unchanged, frame-exact):** `CaptureExclusion` at content root sets
  `sharingType=.none` in `viewDidMoveToWindow`, same CATransaction as content mount.
  Preserved by embedding `Content` directly (no lazy branch) — comment + assert.
  Corollary unchanged: **no `.help()`** in notch content.
- **Layer 2 (component, NEW, source of truth):** `applyCaptureExclusion()` sets
  `sharingType=.none` in panel `init` before first order-front, re-asserted on every
  re-host. Long-lived panel → set once per session, not raced per message. Even the
  empty black shape is non-capturable from frame 0.
- **Result:** app's post-expand re-assert (line 206) + 4-pass screen-change loop
  (lines 32-41) become redundant → deleted.

## Screen-change — reposition, not rebuild

Component owns ONE `didChangeScreenParametersNotification` observer (replaces both
the lib's and the app's). Hidden → no-op. Expanded → re-resolve `targetScreen()` +
re-measure; **re-host only if the resolved screen actually differs**, else just
`setFrame` the existing panel and re-assert level/collectionBehavior/sharingType.
Target screen unplugged → fall back to `NSScreen.main`/floating, no teardown. Panel
identity preserved → `event.window === panel` and makeKey never go stale mid-reply.
Structurally eliminates the lib's rebuild leak.

## Hover · animation · placement · fallback

- **Hover:** `.onHover` on content frame → `updateHoverState` → `isHovering` (guarded
  on-screen). Content extends up under cutout via top `safeAreaInset == notchSize.height`
  so hover fires over the black cutout (decision 2). App owns all meaning.
- **Animation:** opening `.spring(response: 0.6, dampingFraction: 0.7)`,
  `skipIntermediateHides: true` (decision 5). Fade-in/out ~0.15s, ~0.4s settle so the
  app's serialization cadence is preserved bit-for-bit. Internal content morph is the
  app's, untouched.
- **Placement:** centered at top of `targetScreen()` under the cutout; closure default
  `{ NSScreen.main }` fixes hardcoded `screens[0]`, aligns with #7 without an API break.
  Geometry lives in `NotchScreenMetrics` (single source).
- **No-notch fallback:** `hasNotch=false` → rounded `VisualEffectView` pill from
  top-center; same `notchSize=.zero` injected back so app's
  `notchSize.height > 0 ? notchedTeaser : fallbackTeaser` branch works unchanged.

## Integration diff (`NotchPresenter.swift`)

- L3: delete `import DynamicNotchKit`.
- L13: typealias → `NotchPanel<MessageNotchContainer>`.
- L22 + L24-42: delete `screenChangeObservation` field + its init sink (the re-assert loop). init empties.
- L160: `hardwareNotchSize()` → `NotchScreenMetrics.metrics(for: targetScreen()).notchSize`.
- L161: `DynamicNotch(hoverBehavior: .all) {` → `NotchPanel(hoverBehavior: .all) {` (targetScreen defaulted).
- L177-180: `transitionConfiguration` block — unchanged in shape (or delete; defaults already match).
- L183 / L200 / L355: `$isHovering`, `expand()`, `hide()` — unchanged.
- L201-206: delete post-expand `sharingType=.none` re-assert. *(see open Q — may keep one as insurance)*
- L254: `notch?.windowController?.window` → `notch?.panel`. L309 makeKey unchanged.
- L333-348: delete `hardwareNotchSize()` (subsumed).
- Doc-comment prose in `CaptureExclusion.swift`, `MessageNotchContainer.swift`: s/DynamicNotchKit/NotchPanel/ (no code change).
- `Package.swift`: delete the dependency (L8) + product (L16).
- `MessageNotchContainer`/`MessageDisplayModel`/`MessageNotchView`/`TickerText`/`AppModel`: **zero** code changes.

## Build order

- **A — Scaffold** (lib still active): create the 4 files; `NotchPanelWindow` (+ `applyCaptureExclusion`, canBecomeKey); port `NotchScreenMetrics`. Compiles unused.
- **B — Rendering**: port `NotchShape`; build `NotchHostingContent` (notch + notchless, direct Content embed + invariant assert); port `VisualEffectView`.
- **C — Lifecycle**: `NotchPanel` facade; port `expand()`/`hide()` (minus compact/haptics/keepVisible-defer); lazy long-lived panel; screen-change observer (reposition-not-rebuild). Sanity: expand→hide→expand reuses instance; `panel.sharingType==.none` after each expand.
- **D — Swap**: apply integration diff; keep DynamicNotchKit in `Package.swift` for bisect. Run app; verify teaser/hover-expand/reply-focus/send/history/prune/outside-cancel; **verify capture exclusion in real screen share** on create + hover + reply-makeKey + display plug/unplug.
- **E — Cleanup**: delete dependency + product; `grep -rn DynamicNotch Sources/` → empty; update doc prose; clean build + full manual matrix; commit.

## Risks

- **keepVisible-defer dropped** (behavioral change): lib's `.all` re-defers `_hide`
  while hovering; ours collapses when called. App already owns hide-timing and never
  hides while replying → should be *more* deterministic. Verify two-messages-while-
  hovered + hover-during-safetyDuration: no premature collapse, no orphan.
- **expand() return timing:** match the ~0.4s settle — serialization cadence depends on it.
- **Long-lived panel + makeKey mid-reply:** screen-change during an open reply must
  reposition without dropping key/re-mounting content. Test reply-open + unplug.
- **Content-mount invariant** is load-bearing for capture; a future lazy wrapper in
  `NotchHostingContent` would leak. Comment+assert mitigates, can't fully enforce.
- **Hover-over-cutout** depends on content reaching full notch height via safeAreaInset
  — verify by hovering only the black strip.
- NotchlessView fidelity on non-notch Macs (lower priority, user-visible there).

## Decisions (resolved) + minor defaults

1. **Inline** files in `munkel` target (`NotchPanel/`). ✓
2. **Hover under cutout** via top safeAreaInset. ✓
3. Serialization etc. = **app layer, out of scope**. ✓
4. Window level **`.screenSaver`**. ✓
5. Animation = **lib spring** (response 0.6, damping 0.7), `skipIntermediateHides`. ✓
- **Target screen default = `NSScreen.main`** (user: "default main screen"). Display
  picker = issue #7, **not in this scope** (ship `{ NSScreen.main }` now). ✓
- Minor defaults I'll take unless told otherwise: drop vestigial generics
  (`NotchPanel<Content>`); **keep one cheap post-expand `sharingType=.none` as
  insurance** (capture is the core promise); no protocol seam now (extract later only
  if a 2nd impl appears).
