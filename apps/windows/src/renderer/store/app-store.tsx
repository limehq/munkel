import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
	useMemo,
	type ReactNode,
} from 'react';
import type {
	CircleState,
	GitHubLoginState,
	IdentityState,
	Member,
	NotchMessage,
	StateUpdate,
} from '../../shared/types';

interface AppState {
	identity: IdentityState | null;
	circles: CircleState[];
	notchMessages: NotchMessage[];
	githubLoginState: GitHubLoginState;
}

interface AppStore {
	state: AppState;
	setIdentity: (identity: IdentityState | null) => void;
	setCircles: (circles: CircleState[]) => void;
	addCircle: (circle: CircleState) => void;
	removeCircle: (code: string) => void;
	pushNotchMessage: (message: NotchMessage) => void;
	clearNotchMessages: () => void;

	joinCircle: (code: string, relayUrl?: string) => Promise<void>;
	leaveCircle: (code: string) => Promise<void>;
	sendChat: (code: string, text: string, to?: string) => Promise<{ ok: boolean; error?: string }>;
	sendImages: (code: string, paths: string[], caption: string, to?: string) => Promise<{ ok: boolean; error?: string }>;
	selectImages: () => Promise<string[] | undefined>;
	updateProfile: (displayName: string, avatar?: string) => Promise<void>;
	setRelayUrl: (code: string, relayUrl: string) => Promise<void>;
	startGitHubLogin: () => Promise<void>;
	cancelGitHubLogin: () => Promise<void>;
	githubLogout: () => Promise<void>;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AppState>({
		identity: null,
		circles: [],
		notchMessages: [],
		githubLoginState: { phase: 'idle' },
	});

	const setIdentity = useCallback((identity: IdentityState | null) => {
		setState((s) => ({ ...s, identity }));
	}, []);

	const setCircles = useCallback((circles: CircleState[]) => {
		setState((s) => ({ ...s, circles }));
	}, []);

	const addCircle = useCallback((circle: CircleState) => {
		setState((s) => ({ ...s, circles: [...s.circles, circle] }));
	}, []);

	const removeCircle = useCallback((code: string) => {
		setState((s) => ({ ...s, circles: s.circles.filter((c) => c.code !== code) }));
	}, []);

	const pushNotchMessage = useCallback((message: NotchMessage) => {
		setState((s) => ({ ...s, notchMessages: [...s.notchMessages, message] }));
	}, []);

	const clearNotchMessages = useCallback(() => {
		setState((s) => ({ ...s, notchMessages: [] }));
	}, []);

	const applyUpdate = useCallback((update: StateUpdate) => {
		setState((s) => ({
			...s,
			identity: update.identity,
			circles: update.circles,
		}));
	}, []);

	const setGitHubLoginState = useCallback((githubLoginState: GitHubLoginState) => {
		setState((s) => ({ ...s, githubLoginState }));
	}, []);

	useEffect(() => {
		let mounted = true;

		window.electronAPI
			.getState()
			.then((update) => {
				if (mounted) applyUpdate(update);
			})
			.catch((err) => console.error('[app-store] failed to load state', err));

		const removeStateUpdate = window.electronAPI.onStateUpdate((update) => {
			applyUpdate(update);
		});

		const removeGitHubLoginState = window.electronAPI.onGitHubLoginState((githubLoginState) => {
			setGitHubLoginState(githubLoginState);
		});

		const removeNotchMessage = window.electronAPI.onNotchMessage((message) => {
			pushNotchMessage(message);
		});

		return () => {
			mounted = false;
			removeStateUpdate();
			removeGitHubLoginState();
			removeNotchMessage();
		};
	}, [applyUpdate, pushNotchMessage, setGitHubLoginState]);

	const joinCircle = useCallback(async (code: string, relayUrl?: string) => {
		await window.electronAPI.joinCircle(code, relayUrl);
	}, []);

	const leaveCircle = useCallback(async (code: string) => {
		await window.electronAPI.leaveCircle(code);
	}, []);

	const sendChat = useCallback(async (code: string, text: string, to?: string) => {
		return window.electronAPI.sendChat(code, text, to);
	}, []);

	const sendImages = useCallback(async (code: string, paths: string[], caption: string, to?: string) => {
		return window.electronAPI.sendImages(code, paths, caption, to);
	}, []);

	const selectImages = useCallback(async () => {
		return window.electronAPI.selectImages();
	}, []);

	const updateProfile = useCallback(async (displayName: string, avatar?: string) => {
		await window.electronAPI.updateProfile(displayName, avatar);
	}, []);

	const setRelayUrl = useCallback(async (code: string, relayUrl: string) => {
		await window.electronAPI.setRelayUrl(code, relayUrl);
	}, []);

	const startGitHubLogin = useCallback(async () => {
		await window.electronAPI.startGitHubLogin();
	}, []);

	const cancelGitHubLogin = useCallback(async () => {
		await window.electronAPI.cancelGitHubLogin();
	}, []);

	const githubLogout = useCallback(async () => {
		await window.electronAPI.githubLogout();
	}, []);

	const store = useMemo<AppStore>(
		() => ({
			state,
			setIdentity,
			setCircles,
			addCircle,
			removeCircle,
			pushNotchMessage,
			clearNotchMessages,
			joinCircle,
			leaveCircle,
			sendChat,
			sendImages,
			selectImages,
			updateProfile,
			setRelayUrl,
			startGitHubLogin,
			cancelGitHubLogin,
			githubLogout,
		}),
		[
			state,
			setIdentity,
			setCircles,
			addCircle,
			removeCircle,
			pushNotchMessage,
			clearNotchMessages,
			joinCircle,
			leaveCircle,
			sendChat,
			sendImages,
			selectImages,
			updateProfile,
			setRelayUrl,
			startGitHubLogin,
			cancelGitHubLogin,
			githubLogout,
		],
	);

	return <AppContext.Provider value={store}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppStore {
	const ctx = useContext(AppContext);
	if (!ctx) {
		throw new Error('useAppStore must be used inside <AppProvider>');
	}
	return ctx;
}

export type { CircleState, Member, IdentityState };
