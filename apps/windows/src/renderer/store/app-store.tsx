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
	StateUpdate,
	UpdateState,
} from '../../shared/types';

interface AppState {
	identity: IdentityState | null;
	circles: CircleState[];
	githubLoginState: GitHubLoginState;
	updateState: UpdateState;
}

interface AppStore {
	state: AppState;
	setIdentity: (identity: IdentityState | null) => void;
	setCircles: (circles: CircleState[]) => void;
	addCircle: (circle: CircleState) => void;
	removeCircle: (code: string) => void;

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

	checkForUpdates: () => Promise<void>;
	installUpdate: () => Promise<void>;

	getLaunchAtLogin: () => Promise<boolean>;
	setLaunchAtLogin: (enabled: boolean) => Promise<boolean>;

	getAutoUpdateCheck: () => Promise<boolean>;
	setAutoUpdateCheck: (enabled: boolean) => Promise<boolean>;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AppState>({
		identity: null,
		circles: [],
		githubLoginState: { phase: 'idle' },
		updateState: { phase: 'idle' },
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

	const setUpdateState = useCallback((updateState: UpdateState) => {
		setState((s) => ({ ...s, updateState }));
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

		const removeUpdateState = window.electronAPI.onUpdateState((updateState) => {
			setUpdateState(updateState);
		});

		return () => {
			mounted = false;
			removeStateUpdate();
			removeGitHubLoginState();
			removeUpdateState();
		};
	}, [applyUpdate, setGitHubLoginState, setUpdateState]);

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

	const checkForUpdates = useCallback(async () => {
		await window.electronAPI.checkForUpdates();
	}, []);

	const installUpdate = useCallback(async () => {
		await window.electronAPI.installUpdate();
	}, []);

	const getLaunchAtLogin = useCallback(async () => {
		return window.electronAPI.getLaunchAtLogin();
	}, []);

	const setLaunchAtLogin = useCallback(async (enabled: boolean) => {
		return window.electronAPI.setLaunchAtLogin(enabled);
	}, []);

	const getAutoUpdateCheck = useCallback(async () => {
		return window.electronAPI.getAutoUpdateCheck();
	}, []);

	const setAutoUpdateCheck = useCallback(async (enabled: boolean) => {
		return window.electronAPI.setAutoUpdateCheck(enabled);
	}, []);

	const store = useMemo<AppStore>(
		() => ({
			state,
			setIdentity,
			setCircles,
			addCircle,
			removeCircle,
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
			checkForUpdates,
			installUpdate,
			getLaunchAtLogin,
			setLaunchAtLogin,
			getAutoUpdateCheck,
			setAutoUpdateCheck,
		}),
		[
			state,
			setIdentity,
			setCircles,
			addCircle,
			removeCircle,
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
			checkForUpdates,
			installUpdate,
			getLaunchAtLogin,
			setLaunchAtLogin,
			getAutoUpdateCheck,
			setAutoUpdateCheck,
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
