// Tagged releases set MUNKEL_VERSION from the git tag. Both electron-builder
// (artifactName + the latest.yml updater feed) and scripts/write-dist-package.mjs
// read the version from package.json, so patch that one field, build, then always
// restore the committed pin so the tree is never left dirty.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const original = readFileSync(pkgPath, 'utf8');

const raw = (process.env.MUNKEL_VERSION ?? '').trim();
if (raw) {
	const version = raw.startsWith('v') ? raw.slice(1) : raw;
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		console.error(`pack-release: invalid MUNKEL_VERSION ${JSON.stringify(raw)}`);
		process.exit(1);
	}
	const next = original.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
	if (next === original) {
		console.error('pack-release: package.json has no version field');
		process.exit(1);
	}
	writeFileSync(pkgPath, next);
}

function run(command, args) {
	const result = spawnSync(command, args, { stdio: 'inherit', cwd: root, shell: true });
	if (result.status !== 0) {
		throw new Error(`${command} exited with ${result.status ?? 1}`);
	}
}

try {
	run('bun', ['run', 'build']);
	run('electron-builder', ['--win', 'nsis', '--publish', 'never', '--config', 'electron-builder.yml']);
} catch (err) {
	console.error(`pack-release: ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
} finally {
	writeFileSync(pkgPath, original);
}
