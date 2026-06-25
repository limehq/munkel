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
}

export function Avatar({ name, size = 34, isEveryone = false, imageBase64 }: AvatarProps) {
	const [from, to] = getAvatarPalette(name);
	return (
		<div
			className="avatar"
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
