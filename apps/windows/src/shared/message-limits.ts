/**
 * Shared message character limit — mirrors macOS `MessageLimits.maxCharacters`
 * (`apps/macos/Sources/MunkelApp/MessageLimits.swift`) and the CLI's local
 * `MAX_MESSAGE_CHARS` constant (`apps/cli/src/munkel.ts`). Like
 * `src/shared/accelerator.ts`, this module has no electron/DOM dependency of
 * its own, so both the renderer bundle (composer inputs) and the main
 * bundle (incoming-text display clamp in `group-session.ts`) import the same
 * copy instead of forking the constant per bundle.
 *
 * The macOS reference applies the cap symmetrically: outgoing text is
 * clamped before sending and incoming text is clamped before display, so
 * neither a local typo nor a peer can produce an oversized message in the
 * UI. Windows mirrors the *display* half of that (composer inputs +
 * incoming notch/menu text) — see `group-session.ts` for where incoming
 * chat/image-caption text is clamped, and `MenuWindow.tsx` /
 * `NotchWidget.tsx` for the composer/reply-field enforcement. Windows
 * deliberately does NOT also clamp outgoing text at the `GroupSession`
 * session layer (unlike macOS's `GroupSession.swift`): that layer already
 * has its own byte-based ~48 KiB wire-payload cap (`assertPayloadFits`)
 * that *rejects* an over-cap send with a "too long" error for any caller
 * bypassing the UI (e.g. a future CLI-driven send over the control
 * server) — silently truncating there instead would change that existing,
 * tested behavior from a visible error into silent data loss.
 */
export const MAX_MESSAGE_CHARS = 2048;

/** Trims `text` to the character cap, mirroring `MessageLimits.clamp` on macOS. */
export function clampMessageText(text: string): string {
	return text.length > MAX_MESSAGE_CHARS ? text.slice(0, MAX_MESSAGE_CHARS) : text;
}
