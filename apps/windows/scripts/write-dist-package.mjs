// Electron reads `app.getVersion()` from `dist/package.json` when the main
// entry is `dist/main.cjs`. Without this file, `app.setName('munkel')` leaves
// the version as `"0.0"`, and `electron-updater`'s `autoUpdater` getter throws
// `ERR_UPDATER_INVALID_VERSION` — aborting `whenReady` before IPC handlers
// register (tray/menu/notch then see "No handler registered").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
	path.join(distDir, 'package.json'),
	`${JSON.stringify(
		{
			name: 'munkel',
			version: pkg.version,
			main: 'main.cjs',
			private: true,
		},
		null,
		'\t',
	)}\n`,
);
