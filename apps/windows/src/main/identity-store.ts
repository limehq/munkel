import fs from 'node:fs';
import path from 'node:path';
import type { PresenceStatus } from '../shared/types';
import { DEFAULT_PALETTE_HOTKEY, isValidAccelerator } from '../shared/accelerator';

export interface PersistedState {
	version: 1 | 2;
	memberId: string;
	displayName: string;
	avatar?: string;
	githubLogin?: string;
	presenceStatus: PresenceStatus;
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
	// Rebindable global palette-toggle hotkey (Plan 12 P3.1), replacing the
	// old hardcoded `Ctrl+Shift+M` in `shortcuts.ts`. Read at startup by
	// `main.ts` and updated at runtime via the settings-popover recorder;
	// `palette-hotkey.ts#rebindPaletteHotkey` only ever persists a value
	// that was successfully registered with the OS (rollback-on-failure), so
	// this field should always reflect what's actually bound — barring an
	// external file edit, which `migrate` below guards against.
	paletteHotkey: string;
	// Dev-only "Allow in screenshots" toggle (Plan 13 item 5), mirroring
	// macOS `CaptureScreenshotPreference`. Defaults `false` — every window
	// stays excluded from screen capture until a developer opts in. The
	// SET IPC handler only ever accepts a change from a dev build
	// (`main.ts`'s `isDev`), so a packaged release never persists `true`
	// here via its own UI; `session-store.ts`/`main.ts` additionally never
	// *apply* a persisted `true` outside a dev build, guarding against a
	// packaged build launched against a dev-populated userData folder.
	allowInScreenshots: boolean;
	// Dev-only "Echo my broadcasts" toggle (Plan 13 item 6), mirroring macOS
	// Dev-only "echo my broadcasts to me" (Plan 13 item 6). Mirrors macOS
	// `AppModel.devEchoBroadcasts` as a *feature*, but Windows defaults to
	// **opt-in (`false`)** — the previous v1 default of `true` surprised every
	// `bun run dev` user by showing their own sends in the notch. Same
	// dev-only enforcement posture as `allowInScreenshots` above — see
	// `AppState`'s constructor in `session-store.ts` for where the persisted
	// value is folded together with the runtime `isDev` flag.
	devEchoBroadcasts: boolean;
}

function defaultState(): PersistedState {
	return {
		version: 2,
		memberId: crypto.randomUUID().toLowerCase(),
		displayName: '',
		presenceStatus: 'online',
		circles: [],
		launchAtLogin: false,
		autoUpdateCheck: true,
		paletteHotkey: DEFAULT_PALETTE_HOTKEY,
		allowInScreenshots: false,
		devEchoBroadcasts: false,
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
			const migrated = this.migrate(parsed);
			// Persist v1→v2 (and other) migrations so the echo opt-in reset
			// sticks across restarts instead of re-applying from a stale file.
			const prevVersion =
				parsed && typeof parsed === 'object' && typeof (parsed as { version?: unknown }).version === 'number'
					? (parsed as { version: number }).version
					: 0;
			if (migrated.version !== prevVersion) {
				this.save(migrated);
			}
			return migrated;
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
		fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), { mode: 0o600 });
	}

	patch(
		identity: Partial<
			Pick<
				PersistedState,
				| 'displayName'
				| 'avatar'
				| 'githubLogin'
				| 'presenceStatus'
				| 'launchAtLogin'
				| 'autoUpdateCheck'
				| 'paletteHotkey'
				| 'allowInScreenshots'
				| 'devEchoBroadcasts'
			>
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
		if (typeof draft.presenceStatus !== 'string' || !['online', 'dnd', 'away'].includes(draft.presenceStatus)) {
			draft.presenceStatus = 'online';
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
		if (typeof draft.allowInScreenshots !== 'boolean') {
			draft.allowInScreenshots = false;
		}
		if (typeof draft.devEchoBroadcasts !== 'boolean') {
			draft.devEchoBroadcasts = false;
		}
		// v1 → v2: the v1 default was `devEchoBroadcasts: true`, which made
		// every unpackaged dev session echo own broadcasts into the notch
		// without an explicit opt-in. Reset once on upgrade; users who want
		// the solo-test echo can re-enable it in Settings.
		const prevVersion = typeof (parsed as { version?: unknown }).version === 'number'
			? (parsed as { version: number }).version
			: 0;
		if (prevVersion < 2) {
			draft.devEchoBroadcasts = false;
			draft.version = 2;
		}
		// Guard against a hand-edited or corrupted state.json shipping an
		// unregistrable accelerator string straight into globalShortcut.register.
		if (!isValidAccelerator(draft.paletteHotkey)) {
			draft.paletteHotkey = DEFAULT_PALETTE_HOTKEY;
		}

		return draft as PersistedState;
	}
}
