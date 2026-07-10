import fs from 'node:fs';
import path from 'node:path';

export interface PersistedState {
	version: 1;
	memberId: string;
	displayName: string;
	avatar?: string;
	githubLogin?: string;
	circles: Array<{ code: string; relayUrl: string; joinedAt: string }>;
	// Opt-in autostart preference (Plan 12 P2.1). Unlike the macOS release,
	// which auto-registers once on first launch, Windows always defaults to
	// `false` and only ever mirrors the user's explicit toggle choice.
	launchAtLogin: boolean;
	// Auto-update "Check Automatically" preference (Plan 12 P3.7), mirroring
	// macOS `UpdaterController.automaticallyChecksForUpdates`. Defaults to
	// `true` — today's behavior of checking on launch + every 24h. Disabling
	// only stops the automatic checks; the menu's manual "Check for
	// Updates…" button always works regardless.
	autoUpdateCheck: boolean;
}

function defaultState(): PersistedState {
	return {
		version: 1,
		memberId: crypto.randomUUID().toLowerCase(),
		displayName: '',
		circles: [],
		launchAtLogin: false,
		autoUpdateCheck: true,
	};
}

export class IdentityStore {
	private readonly filePath: string;

	constructor(userDataPath: string) {
		this.filePath = path.join(userDataPath, 'state.json');
	}

	load(): PersistedState {
		if (!fs.existsSync(this.filePath)) {
			// Phase-0 diagnostics (presence bug, H-D): a silent default here means
			// persisted circles are lost — a direct explanation for "not online".
			console.error('[identity] state file missing — creating default', JSON.stringify({ path: this.filePath }));
			const state = defaultState();
			this.save(state);
			return state;
		}

		try {
			const raw = fs.readFileSync(this.filePath, 'utf8');
			const parsed = JSON.parse(raw) as unknown;
			return this.migrate(parsed);
		} catch (err) {
			console.error(
				'[identity] state unreadable — resetting to default',
				JSON.stringify({ path: this.filePath, error: err instanceof Error ? err.message : String(err) }),
			);
			const state = defaultState();
			this.save(state);
			return state;
		}
	}

	save(state: PersistedState): void {
		fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
		fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
	}

	patch(
		identity: Partial<
			Pick<PersistedState, 'displayName' | 'avatar' | 'githubLogin' | 'launchAtLogin' | 'autoUpdateCheck'>
		>,
	): void {
		const state = this.load();
		Object.assign(state, identity);
		this.save(state);
	}

	addCircle(code: string, relayUrl: string): void {
		const state = this.load();
		const exists = state.circles.find((c) => c.code === code);
		if (exists) {
			exists.relayUrl = relayUrl;
		} else {
			state.circles.push({
				code,
				relayUrl,
				joinedAt: new Date().toISOString(),
			});
		}
		this.save(state);
	}

	removeCircle(code: string): void {
		const state = this.load();
		state.circles = state.circles.filter((c) => c.code !== code);
		this.save(state);
	}

	private migrate(parsed: unknown): PersistedState {
		if (!parsed || typeof parsed !== 'object') {
			return defaultState();
		}

		const draft = { ...defaultState(), ...(parsed as Record<string, unknown>) };

		if (typeof draft.memberId !== 'string' || draft.memberId.length === 0) {
			draft.memberId = crypto.randomUUID().toLowerCase();
		}
		if (typeof draft.displayName !== 'string') {
			draft.displayName = '';
		}
		if (!Array.isArray(draft.circles)) {
			draft.circles = [];
		}
		if (typeof draft.launchAtLogin !== 'boolean') {
			draft.launchAtLogin = false;
		}
		if (typeof draft.autoUpdateCheck !== 'boolean') {
			draft.autoUpdateCheck = true;
		}

		return draft as PersistedState;
	}
}
