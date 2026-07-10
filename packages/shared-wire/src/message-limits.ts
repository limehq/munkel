/**
 * Shared message character limit — mirrors macOS `MessageLimits.maxCharacters`
 * (`apps/macos/Sources/MunkelApp/MessageLimits.swift`). This lives in
 * `@munkel/shared-wire` (not `apps/windows/src/shared`) so it is the single
 * source of truth for every workspace package that needs it, without any
 * package importing across another app's package boundary:
 * `apps/cli/src/munkel.ts` imports `MAX_MESSAGE_CHARS` from here instead of
 * keeping its own local constant, and `apps/windows` (composer inputs via
 * `MenuWindow.tsx` / `NotchWidget.tsx`, incoming-text display clamp in
 * `group-session.ts`) imports the same copy instead of forking the constant
 * per bundle. This module has no electron/DOM/Node dependency of its own, so
 * it is safe for the CLI (Bun, no Electron) and the renderer/main bundles
 * (Electron) alike.
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

/**
 * Trims `text` to the character cap, mirroring `MessageLimits.clamp` on macOS.
 *
 * macOS counts Swift `String` length in *extended grapheme clusters*
 * (`text.count` / `text.prefix`), so an emoji, ZWJ sequence (e.g. a family
 * emoji), flag, or skin-tone modifier counts as one character and is never
 * split. A naive UTF-16 `String.slice(0, 2048)` would count code units
 * instead and could sever a surrogate pair or ZWJ cluster mid-way, leaving a
 * lone surrogate / broken glyph. This clamp mirrors macOS by segmenting into
 * grapheme clusters via `Intl.Segmenter` (available in Electron's Chromium
 * runtime and in Bun's test runtime) and cutting on a cluster boundary.
 */
export function clampMessageText(text: string): string {
	// Fast path: UTF-16 length is an upper bound on the grapheme count (a
	// grapheme is always ≥ 1 code unit), so if the code-unit length already
	// fits, the grapheme count cannot exceed the cap either — no segmentation
	// needed. This keeps the common (all-ASCII) case allocation-free.
	if (text.length <= MAX_MESSAGE_CHARS) return text;

	if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
		const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
		let result = '';
		let count = 0;
		for (const { segment } of segmenter.segment(text)) {
			if (count >= MAX_MESSAGE_CHARS) break;
			result += segment;
			count += 1;
		}
		return result;
	}

	// Fallback for any runtime without Intl.Segmenter: code-unit slice, but
	// back off one unit if the cut would land between a surrogate pair so we
	// never emit a lone high surrogate.
	let end = MAX_MESSAGE_CHARS;
	const code = text.charCodeAt(end - 1);
	if (code >= 0xd800 && code <= 0xdbff) end -= 1;
	return text.slice(0, end);
}
