// Clears apps/windows/dist/ once, before the main/preload/renderer Vite
// builds run. main and preload build from separate single-entry Vite configs
// (see vite.main.config.ts and vite.preload.config.ts) with `emptyOutDir:
// false` each, so neither build wipes the other's freshly written output —
// this script owns the one-time clean instead. Also used by scripts/dev.mjs
// before starting the watch-mode builds.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
await import(pathToFileURL(path.join(__dirname, 'write-dist-package.mjs')).href);
