import { defineConfig } from 'vite';
import path from 'node:path';

// Single entry point ONLY. Do not add the preload entry back here — see
// vite.preload.config.ts for why main and preload must build as separate,
// non-code-split bundles (docs/bugs/windows-ui-invisible-2026-07-10.md).
// `emptyOutDir` is false because scripts/clean-dist.mjs owns clearing `dist/`
// once per build; if this config emptied it, every watch-mode rebuild of
// main.ts would delete the sibling dist/preload.cjs written by the other
// (independently watched) preload build.
export default defineConfig({
	build: {
		target: 'es2022',
		lib: {
			entry: path.resolve('src/main/main.ts'),
			formats: ['cjs'],
			fileName: () => 'main.cjs',
		},
		outDir: 'dist',
		emptyOutDir: false,
		rollupOptions: {
			external: ['electron', 'electron-updater', 'ws', 'sharp', /^@img\//, /^@jsquash\/avif/, 'image-size', /^node:/],
		},
		sourcemap: true,
	},
});
