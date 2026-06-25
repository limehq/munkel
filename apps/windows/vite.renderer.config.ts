import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
	root: path.resolve('src/renderer'),
	base: './',
	server: {
		// dev.mjs picks the first free port from VITE_DEV_PORT (default 5174).
		port: Number(process.env.VITE_DEV_PORT ?? 5174),
		strictPort: false,
	},
	build: {
		target: 'es2022',
		outDir: path.resolve('dist/renderer'),
		emptyOutDir: true,
	},
	plugins: [react()],
});
