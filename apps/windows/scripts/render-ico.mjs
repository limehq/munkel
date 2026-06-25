import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.join(__dirname, '../assets/tray-icon.svg');
const outPath = path.join(__dirname, '../assets/icon.ico');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const buffers = await Promise.all(
  sizes.map(async (size) => {
    const png = await sharp(svgPath, { density: (size / 24) * 72 * 4 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { size, png };
  })
);

let offset = 6 + buffers.length * 16;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(buffers.length, 4);

const entries = [];
const images = [];
for (const { size, png } of buffers) {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  images.push(png);
  offset += png.length;
}

fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...images]));
console.log('wrote ' + outPath);
