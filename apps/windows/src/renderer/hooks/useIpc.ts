import { useEffect } from 'react';

export function useIpc() {
	return window.electronAPI;
}

export function useGlobalShortcut(callback: () => void) {
	const ipc = useIpc();
	useEffect(() => {
		return ipc.onGlobalShortcut(callback);
	}, [ipc, callback]);
}
