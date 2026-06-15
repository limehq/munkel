import fs from 'node:fs';
import path from 'node:path';

export interface PersistedState {
	version: 1;
	memberId: string;
	displayName: string;
	avatar?: string;
	githubLogin?: string;
	circles: Array<{ code: string; relayUrl: string; joinedAt: string }>;
}

function defaultState(): PersistedState {
	return {
		version: 1,
		memberId: crypto.randomUUID().toLowerCase(),
		displayName: '',
		circles: [],
	};
}

export class IdentityStore {
	private readonly filePath: string;

	constructor(userDataPath: string) {
		this.filePath = path.join(userDataPath, 'state.json');
	}

	load(): PersistedState {
		if (!fs.existsSync(this.filePath)) {
			const state = defaultState();
			this.save(state);
			return state;
		}

		try {
			const raw = fs.readFileSync(this.filePath, 'utf8');
			const parsed = JSON.parse(raw) as unknown;
			return this.migrate(parsed);
		} catch {
			const state = defaultState();
			this.save(state);
			return state;
		}
	}

	save(state: PersistedState): void {
		fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
		fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
	}

	patch(identity: Partial<Pick<PersistedState, 'displayName' | 'avatar' | 'githubLogin'>>): void {
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

		return draft as PersistedState;
	}
}
