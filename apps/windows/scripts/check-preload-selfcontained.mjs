#!/usr/bin/env node
// Regression guard for the P0 "UI invisible" bug (2026-07-10):
// docs/bugs/windows-ui-invisible-2026-07-10.md
//
// Electron's sandboxed preload context cannot resolve relative
// `require("./chunk.cjs")` calls. Vite lib-mode builds with more than one
// entry (main + preload in the same config) code-split shared modules (e.g.
// ../shared/ipc-channels) into a separate chunk and had preload.cjs
// `require()` it at runtime — that silently broke `window.electronAPI` in
// every renderer, every single launch.
//
// This script fails the build if dist/preload.cjs contains any require()
// call other than the bare "electron" specifier. Run it as part of the
// `build` script (apps/windows/package.json) so this bug can never return
// silently.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findDisallowedRequires } from './lib/require-scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const preloadPath = path.join(root, 'dist', 'preload.cjs');

if (!fs.existsSync(preloadPath)) {
	console.error(
		`[check-preload-selfcontained] dist/preload.cjs not found at ${preloadPath}. Run "bun run build" first.`,
	);
	process.exit(1);
}

const content = fs.readFileSync(preloadPath, 'utf8');
// Uses a small tokenizing scanner (scripts/lib/require-scan.mjs), not a
// naive regex: a regex over raw text also matches `require("./x")` text
// sitting inside a string literal or comment (false positive), and misses
// `require(\`electron\`)` / `require(someVar)` (false negative — a
// sandboxed preload only survives a literal `require("electron")`, so any
// non-literal specifier must fail closed).
const disallowed = findDisallowedRequires(content);

if (disallowed.length > 0) {
	console.error(
		'[check-preload-selfcontained] dist/preload.cjs is NOT self-contained.\n' +
			'Electron sandboxed preload scripts cannot resolve relative require() calls at runtime — ' +
			'this caused the 2026-07-10 "UI invisible" P0 (docs/bugs/windows-ui-invisible-2026-07-10.md).\n' +
			`Disallowed require() specifiers found: ${disallowed.join(', ')}\n` +
			'Likely cause: vite.main.config.ts / vite.preload.config.ts merged back into one multi-entry ' +
			'lib build, letting Rollup code-split a shared chunk. Keep them as separate single-entry builds.',
	);
	process.exit(1);
}

console.log('[check-preload-selfcontained] OK — dist/preload.cjs only requires "electron".');
