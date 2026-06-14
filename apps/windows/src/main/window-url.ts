import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function getWindowUrl(route: string): string {
	if (process.env.VITE_DEV_SERVER_URL) {
		return `${process.env.VITE_DEV_SERVER_URL}#${route}`;
	}
	return `file://${path.join(__dirname, '../renderer/index.html')}#${route}`;
}
