import { powerMonitor } from 'electron';
import type { IdleTimeSource } from './presence-monitor';

export class ElectronIdleTimeSource implements IdleTimeSource {
	getIdleTimeMs(): number {
		// Electron returns seconds; convert to milliseconds.
		return powerMonitor.getSystemIdleTime() * 1000;
	}

	onLock(cb: () => void): () => void {
		powerMonitor.on('lock-screen', cb);
		return () => powerMonitor.off('lock-screen', cb);
	}

	onUnlock(cb: () => void): () => void {
		powerMonitor.on('unlock-screen', cb);
		return () => powerMonitor.off('unlock-screen', cb);
	}

	onSuspend(cb: () => void): () => void {
		powerMonitor.on('suspend', cb);
		return () => powerMonitor.off('suspend', cb);
	}

	onResume(cb: () => void): () => void {
		powerMonitor.on('resume', cb);
		return () => powerMonitor.off('resume', cb);
	}
}
