import { createServer, build } from 'vite';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PREFERRED_PORT = Number(process.env.VITE_DEV_PORT ?? 5174);
const MAX_PORT_TRIES = 50;
const HOST = '127.0.0.1';

/** @type {import('node:child_process').ChildProcess | null} */
let electronProcess = null;

/**
 * Probe whether `host:port` is free before Vite binds. Avoids collisions with
 * other local Vite/Electron apps (often on 5173).
 */
function isPortAvailable(port) {
	return new Promise((resolve) => {
		const probe = net.createServer();
		probe.unref();
		probe.once('error', () => resolve(false));
		probe.listen({ port, host: HOST }, () => {
			probe.close(() => resolve(true));
		});
	});
}

async function findAvailablePort(start) {
	for (let port = start; port < start + MAX_PORT_TRIES; port++) {
		if (await isPortAvailable(port)) {
			return port;
		}
	}
	throw new Error(
		`No free dev port in range ${start}–${start + MAX_PORT_TRIES - 1}. ` +
			'Set VITE_DEV_PORT to a free port or stop conflicting processes.',
	);
}

function getElectronPath() {
	if (process.platform === 'win32') {
		return path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
	}
	return path.join(root, 'node_modules', '.bin', 'electron');
}

function areOutputsReady() {
	return ['main.cjs', 'preload.cjs'].every((name) => fs.existsSync(path.join(root, 'dist', name)));
}

function startOrRestartElectron() {
	if (!areOutputsReady()) return;
	if (electronProcess) {
		electronProcess.kill();
		electronProcess = null;
	}
	// `ELECTRON_RUN_AS_NODE` can leak in from a VS Code / Claude Code terminal
	// parent process (not persisted, but inherited by any shell it spawns). If
	// it survives into the child env, the real Electron binary runs in plain
	// Node mode (`require('electron')` resolves to a path string, not the
	// API), so `app.setName()` throws at main.ts's top level and the app dies
	// before a window ever opens — no error dialog, just silence. Strip it
	// defensively so a dev launch never silently no-ops. See
	// docs/bugs/windows-ui-invisible-2026-07-10.md.
	const childEnv = { ...process.env, NODE_ENV: 'development' };
	delete childEnv.ELECTRON_RUN_AS_NODE;
	electronProcess = spawn(getElectronPath(), [path.join(root, 'dist', 'main.cjs')], {
		stdio: 'inherit',
		env: childEnv,
	});
}

async function main() {
	const port = await findAvailablePort(PREFERRED_PORT);
	if (port !== PREFERRED_PORT) {
		process.stdout.write(
			`[dev] port ${PREFERRED_PORT} busy — using ${port} (override with VITE_DEV_PORT)\n`,
		);
	}

	const rendererServer = await createServer({
		configFile: path.join(root, 'vite.renderer.config.ts'),
	});
	await rendererServer.listen({ port, host: HOST, strictPort: true });

	const url = `http://${HOST}:${port}`;
	process.stdout.write(`[dev] renderer at ${url}\n`);
	process.env.VITE_DEV_SERVER_URL = url;

	// main and preload are separate single-entry Vite lib builds (see
	// vite.main.config.ts / vite.preload.config.ts) so Rollup never code-splits
	// a shared chunk that a sandboxed preload script cannot require() at
	// runtime — docs/bugs/windows-ui-invisible-2026-07-10.md. Both configs use
	// `emptyOutDir: false` (each only ever writes its own file into dist/), so
	// we clear dist/ once here ourselves before starting either watcher —
	// otherwise the two watchers would never wipe stale output on a cold start.
	fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });

	const electronStarterPlugin = {
		name: 'electron-starter',
		closeBundle() {
			startOrRestartElectron();
		},
	};

	const mainWatcher = await build({
		configFile: path.join(root, 'vite.main.config.ts'),
		build: { watch: {} },
		plugins: [electronStarterPlugin],
	});

	const preloadWatcher = await build({
		configFile: path.join(root, 'vite.preload.config.ts'),
		build: { watch: {} },
		plugins: [electronStarterPlugin],
	});

	const shutdown = () => {
		rendererServer.close();
		mainWatcher.close();
		preloadWatcher.close();
		if (electronProcess) electronProcess.kill();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
