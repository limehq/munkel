import { useEffect, useState } from 'react';

// Plan 12 P3.5: how long the one-time pulse ring plays before its class is
// removed — kept in sync with the `avatar-pulse-ring` keyframe duration in
// global.css (0.9s). Exported so callers/tests don't have to hardcode it.
export const AVATAR_PULSE_DURATION_MS = 900;

const palettes: [string, string][] = [
	['#f56a6a', '#d93069'],
	['#5ba6fa', '#3857eb'],
	['#66d99e', '#1a9376'],
	['#fab74f', '#ea6b2e'],
	['#bf84fa', '#7a3fe0'],
	['#57d6dc', '#2980b8'],
];

export function getAvatarPalette(name: string): [string, string] {
	let hash = 0xcbf29ce484222325n;
	for (const byte of new TextEncoder().encode(name)) {
		hash ^= BigInt(byte);
		hash = (hash * 0x00000100000001b3n) & 0xffffffffffffffffn;
	}
	return palettes[Number(hash % BigInt(palettes.length))];
}

export function getInitials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0])
		.join('')
		.toUpperCase();
}

interface AvatarProps {
	name: string;
	size?: number;
	isEveryone?: boolean;
	imageBase64?: string;
	/**
	 * Plan 12 P3.5: play a one-time pulse ring (macOS `AvatarView`'s
	 * new-message pulse). Captured only at *mount* time — deliberately
	 * ignored on later re-renders (see the mount-only effect below) so a
	 * caller that keeps passing `pulse={true}` across re-renders of an
	 * already-mounted Avatar (e.g. the newest message during its `full`
	 * phase, which re-renders on unrelated state changes like hover) never
	 * re-triggers the animation. Fresh mounts — a genuinely new message row
	 * — always get their own fresh Avatar instance, so "mount-only" and
	 * "new message" coincide in practice.
	 */
	pulse?: boolean;
	/** Test-only override for AVATAR_PULSE_DURATION_MS. */
	pulseDurationMs?: number;
}

export function Avatar({
	name,
	size = 34,
	isEveryone = false,
	imageBase64,
	pulse = false,
	pulseDurationMs = AVATAR_PULSE_DURATION_MS,
}: AvatarProps) {
	const [from, to] = getAvatarPalette(name);
	const [pulsing, setPulsing] = useState(pulse);

	// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
	// mount-only: only the `pulse` value present at mount should ever start
	// the animation; see the doc comment on the `pulse` prop above.
	useEffect(() => {
		if (!pulsing) return;
		const timer = setTimeout(() => setPulsing(false), pulseDurationMs);
		return () => clearTimeout(timer);
	}, []);

	return (
		<div
			className={pulsing ? 'avatar avatar-pulse' : 'avatar'}
			style={{
				width: size,
				height: size,
				fontSize: size * 0.38,
				background: isEveryone ? 'rgba(255,255,255,0.12)' : `linear-gradient(135deg, ${from}, ${to})`,
			}}
		>
			{isEveryone ? (
				'👥'
			) : imageBase64 ? (
				<img
					className="avatar-image"
					src={`data:image/jpeg;base64,${imageBase64}`}
					alt={name}
				/>
			) : (
				getInitials(name)
			)}
		</div>
	);
}
