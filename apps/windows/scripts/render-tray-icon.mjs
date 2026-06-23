import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, '../assets/tray-icon.svg');
const outDir = path.join(__dirname, '../assets');

const sizes = [16, 32, 48];

for (const size of sizes) {
	const outName = size === 16 ? 'tray-icon.png' : `tray-icon-${size}.png`;
	await sharp(svgPath, { density: (size / 24) * 72 * 4 })
		.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(path.join(outDir, outName));
	console.log(`rendered ${outName}`);
}
