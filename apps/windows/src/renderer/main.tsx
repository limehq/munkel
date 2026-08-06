import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './store/app-store';
import './styles/global.css';

const startupT0 = performance.now();
function startupMark(label: string): void {
	if (typeof console === 'undefined') return;
	console.info(`[startup] ${label} +${Math.round(performance.now() - startupT0)}ms`);
}
startupMark('scriptStart');

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<AppProvider>
			<App />
		</AppProvider>
	</React.StrictMode>
);

requestAnimationFrame(() => startupMark('react.mount'));
