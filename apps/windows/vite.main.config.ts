import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
	build: {
		target: 'es2022',
		lib: {
			entry: {
				main: path.resolve('src/main/main.ts'),
				preload: path.resolve('src/main/preload.ts'),
			},
			formats: ['cjs'],
			fileName: (_format, entryName) => `${entryName}.cjs`,
		},
		outDir: 'dist',
		emptyOutDir: true,
		rollupOptions: {
			external: ['electron', 'ws', /^@jsquash\/avif/, 'image-size', /^node:/],
		},
		sourcemap: true,
	},
});
