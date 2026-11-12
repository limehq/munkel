import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { findDisallowedRequires } from '../../../scripts/lib/require-scan.mjs';

// Regression guard for the P0 "UI invisible" bug (2026-07-10): Electron's
// sandboxed preload context cannot resolve a relative `require("./chunk.cjs")`
// call. Vite lib-mode builds with main.ts and preload.ts sharing one config
// (two entries) let Rollup code-split the shared ../shared/ipc-channels
// module into a separate chunk, and preload.cjs required it — that silently
// broke `window.electronAPI` in every renderer, every launch. See
// docs/bugs/windows-ui-invisible-2026-07-10.md.
//
// This test inspects the CURRENT dist/preload.cjs build artifact and skips
// (does not fail) when dist/ hasn't been built yet, so it never blocks a
// typecheck-only or pre-build test run. The hard, always-on gate is
// scripts/check-preload-selfcontained.mjs, wired into `bun run build`
// (apps/windows/package.json) — this test is a convenience duplicate that
// catches the regression in `bun test` runs too, whenever dist/ is present.
const preloadPath = path.resolve(import.meta.dir, '../../../dist/preload.cjs');
const distBuilt = fs.existsSync(preloadPath);

describe('preload.cjs build artifact', () => {
	it.skipIf(!distBuilt)('is self-contained — only requires "electron", no relative chunk imports', () => {
		const content = fs.readFileSync(preloadPath, 'utf8');
		const disallowed = findDisallowedRequires(content);
		expect(disallowed).toEqual([]);
	});
});
