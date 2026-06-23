/**
 * Wire-protocol handlers for the named-pipe control server.
 *
 * Mirrors `apps/macos/Sources/MunkelApp/AppModel.swift` `handleControl` so the
 * `munkel` CLI can talk to the Windows system-tray app the same way it talks
 * to the macOS menu-bar app. The request/response shape (newline-delimited
 * JSON over a single connection) and the action names (`groups`, `send`) are
 * intentionally identical — both apps own a `ControlGroupInfo`-shaped list
 * and the same error semantics for ambiguous recipients.
 */

import { normalizeCircleCode } from '../core';
import type { CircleState } from '../shared/types';
import type { ControlGroupInfo, ControlRequest, ControlResponse } from '../core/control';
import type { SendResult } from './group-session';

/**
 * Minimal `AppState` surface this module depends on. Keeps the handlers
 * unit-testable with a plain fake (see `control-handlers.test.ts`); the
 * production `AppState` in `session-store.ts` satisfies it structurally.
 */
export interface ControlAppState {
	getState(): { circles: CircleState[] };
	sendChat(code: string, text: string, to?: string): Promise<SendResult>;
	sendImages(code: string, paths: string[], caption: string, to?: string): Promise<SendResult>;
}

const BROADCAST_ALIASES = new Set(['all', '*']);

function memberLabel(member: CircleState['members'][number]): string {
	return member.displayName ?? member.memberId;
}

function recipientMatches(
	member: CircleState['members'][number],
	query: string,
): boolean {
	const q = query.toLowerCase();
	return memberLabel(member).toLowerCase() === q || member.memberId.toLowerCase().startsWith(q);
}

/**
 * Resolve `query` against the list of connected circles.
 *
 * Mirrors `AppModel.resolveGroup` in the macOS app: an exact normalized
 * match wins; otherwise a unique prefix match wins; otherwise the query is
 * unknown or ambiguous. Returns `null` in both failure cases — the caller
 * formats the error message.
 */
function resolveGroup(
	circles: CircleState[],
	query: string,
): CircleState | null {
	const normalized = normalizeCircleCode(query);
	const exact = circles.find((c) => c.code === normalized);
	if (exact) return exact;

	const prefixMatches = circles.filter((c) => c.code.startsWith(normalized));
	if (prefixMatches.length === 1) return prefixMatches[0];
	return null;
}

function snapshotGroup(circle: CircleState): ControlGroupInfo {
	return {
		code: circle.code,
		connected: circle.isConnected,
		members: circle.members.map(memberLabel),
	};
}

/**
 * Build the async control-protocol handler bound to a given `AppState`.
 *
 * One request/response per connection — the transport layer in
 * `core/transport.ts` already opens/closes the pipe per call and translates
 * thrown errors into `{ ok: false, error }` envelopes.
 */
export function buildControlHandler(
	appState: ControlAppState,
): (request: ControlRequest) => Promise<ControlResponse> {
	return async (request) => {
		switch (request.action) {
			case 'groups': {
				const circles = appState.getState().circles;
				return { ok: true, groups: circles.map(snapshotGroup) };
			}

			case 'send': {
				// Image sends (`munkel image …`) — route to sendImages with
				// the request's imagePaths and the caption from `text`.
				if (request.imagePaths && request.imagePaths.length > 0) {
					if (!request.group) {
						return { ok: false, error: 'Image sends need a circle — say `munkel <circle> image …`' };
					}
					const sent = await appState.sendImages(
						request.group,
						request.imagePaths,
						request.text ?? '',
						request.to,
					);
					return sent.ok
						? { ok: true }
						: { ok: false, error: sent.error ?? 'Image send failed.' };
				}
				const text = request.text ?? '';
				if (text.length === 0) {
					return { ok: false, error: 'Empty message' };
				}

				const circles = appState.getState().circles;
				const isBroadcast = request.to
					? BROADCAST_ALIASES.has(request.to.toLowerCase())
					: false;

				// Circle-scoped send: explicit circle code. Required for a
				// broadcast and used to disambiguate a name across circles.
				if (request.group) {
					const circle = resolveGroup(circles, request.group);
					if (!circle) {
						return {
							ok: false,
							error: `Unknown or ambiguous circle "${request.group}" — munkel circles shows them all`,
						};
					}
					let recipientId: string | undefined;
					if (request.to && !isBroadcast) {
						const matches = circle.members.filter((m) =>
							recipientMatches(m, request.to as string),
						);
						if (matches.length !== 1) {
							const problem = matches.length === 0 ? "isn't online" : 'is ambiguous';
							return {
								ok: false,
								error: `"${request.to}" ${problem} in ${circle.code}`,
							};
						}
						recipientId = matches[0].memberId;
					}
					const sent = await appState.sendChat(circle.code, text, recipientId);
					return sent.ok
						? { ok: true }
						: { ok: false, error: sent.error ?? 'Send failed — no connection to the relay?' };
				}

				// Recipient-only send (`munkel dm <name> …`): no circle given,
				// resolve the name across every circle. Mirrors macOS.
				if (!request.to || isBroadcast) {
					return {
						ok: false,
						error: 'Broadcast needs a circle — say `munkel <circle> all …`',
					};
				}
				type Hit = { circle: CircleState; member: CircleState['members'][number] };
				const hits: Hit[] = [];
				for (const circle of circles) {
					for (const member of circle.members) {
						if (recipientMatches(member, request.to)) {
							hits.push({ circle, member });
						}
					}
				}
				if (hits.length !== 1) {
					if (hits.length === 0) {
						return {
							ok: false,
							error: `No online member matches "${request.to}" — munkel circles shows who's online`,
						};
					}
					// Ambiguous: only name the candidate circles (and attach
					// them as a discovery payload) so the caller can retry
					// with `munkel <circle> <name> …`.
					const seen = new Set<string>();
					const candidateCodes: string[] = [];
					const candidateGroups: ControlGroupInfo[] = [];
					for (const { circle } of hits) {
						if (seen.has(circle.code)) continue;
						seen.add(circle.code);
						candidateCodes.push(circle.code);
						candidateGroups.push(snapshotGroup(circle));
					}
					return {
						ok: false,
						error: `"${request.to}" is in ${candidateCodes.join(', ')} — say \`munkel <circle> ${request.to} …\``,
						groups: candidateGroups,
					};
				}
				const sent = await appState.sendChat(hits[0].circle.code, text, hits[0].member.memberId);
				return sent.ok
					? { ok: true }
					: { ok: false, error: sent.error ?? 'Send failed — no connection to the relay?' };
			}

			default:
				return { ok: false, error: `Unknown action "${request.action}"` };
		}
	};
}
