import { createServer, build } from 'vite';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** @type {import('node:child_process').ChildProcess | null} */
let electronProcess = null;

function getElectronPath() {
	if (process.platform === 'win32') {
		return path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
	}
	return path.join(root, 'node_modules', '.bin', 'electron');
}

function startOrRestartElectron() {
	if (electronProcess) {
		electronProcess.kill();
		electronProcess = null;
	}
	electronProcess = spawn(getElectronPath(), [path.join(root, 'dist', 'main.cjs')], {
		stdio: 'inherit',
		env: { ...process.env, NODE_ENV: 'development' },
	});
}

async function main() {
	const rendererServer = await createServer({
		configFile: path.join(root, 'vite.renderer.config.ts'),
	});
	await rendererServer.listen();

	const address = rendererServer.httpServer.address();
	const url = typeof address === 'string' ? address : `http://localhost:${address.port}`;
	process.env.VITE_DEV_SERVER_URL = url;

	const mainWatcher = await build({
		configFile: path.join(root, 'vite.main.config.ts'),
		build: { watch: {} },
		plugins: [
			{
				name: 'electron-starter',
				closeBundle() {
					startOrRestartElectron();
				},
			},
		],
	});

	const shutdown = () => {
		rendererServer.close();
		mainWatcher.close();
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
