/**
 * Fixed, clearly distinct palette for circle markers. Mirrors
 * `apps/macos/Sources/MunkelApp/GroupColor.swift`: 8 colors, selected by
 * the circle's position in the joined list, so two circles with similar
 * codes can never collide locally (a content hash did — see pre-port
 * Windows version). Green and orange are deliberately absent: the menu
 * already uses them as connection status, and the dot must not read as
 * "online".
 *
 * The caller (`AppState.getState().circles` / `GroupSession.onNotch`)
 * passes the joined-list index — never the circle code — so the
 * selection is stable across app restarts and across members of the
 * same circle.
 */

const groupPalette = [
	'#3b82f6', // blue
	'#a855f7', // purple
	'#ec4899', // pink
	'#14b8a6', // teal
	'#eab308', // yellow
	'#6366f1', // indigo
	'#10b981', // mint
	'#92400e', // brown
] as const;

/**
 * Return the marker color for the circle at the given joined-list index.
 * Negative indices wrap to the end (defensive — current callers always
 * pass non-negative).
 */
export function getCircleColor(index: number): string {
	const n = groupPalette.length;
	return groupPalette[((index % n) + n) % n];
}