import { defineConfig } from 'vite';
import path from 'node:path';

// Preload MUST build as a single, fully self-contained CJS file with a
// single entry point. Electron's sandboxed preload context calls `require()`
// through a restricted loader that cannot resolve a relative path like
// `require("./ipc-channels-XXXX.cjs")` — only bare specifiers Electron itself
// provides (e.g. "electron") work. When main.ts and preload.ts were built
// together in one Vite lib-mode config (two entries), Rollup extracted the
// module shared by both (../shared/ipc-channels) into a separate chunk and
// had preload.cjs `require()` it — that silently broke `window.electronAPI`
// in every renderer at runtime. See
// docs/bugs/windows-ui-invisible-2026-07-10.md for the full incident writeup
// and scripts/check-preload-selfcontained.mjs for the regression guard.
//
// `inlineDynamicImports: true` is defensive: even if a future edit adds a
// dynamic `import()` inside preload.ts (or one of its shared-code
// dependencies), Rollup will inline it instead of splitting out a chunk.
//
// `emptyOutDir` is false for the same reason as vite.main.config.ts —
// scripts/clean-dist.mjs clears `dist/` once per build/dev-session; this
// config only ever adds/overwrites dist/preload.cjs.
export default defineConfig({
	build: {
		target: 'es2022',
		lib: {
			entry: path.resolve('src/main/preload.ts'),
			formats: ['cjs'],
			fileName: () => 'preload.cjs',
		},
		outDir: 'dist',
		emptyOutDir: false,
		rollupOptions: {
			external: ['electron'],
			output: {
				inlineDynamicImports: true,
			},
		},
		sourcemap: true,
	},
});
