import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
	root: path.resolve('src/renderer'),
	base: './',
	build: {
		target: 'es2022',
		outDir: path.resolve('dist/renderer'),
		emptyOutDir: true,
	},
	plugins: [react()],
});
