import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { NotchMessage } from '../../shared/types';

interface CircleView {
	code: string;
	groupId: string;
	relayUrl: string;
	isConnected: boolean;
	members: { memberId: string; displayName: string; avatar?: string }[];
}

interface IdentityView {
	memberId: string;
	displayName: string;
	avatar?: string;
}

interface AppState {
	identity: IdentityView | null;
	circles: CircleView[];
	notchMessages: NotchMessage[];
}

interface AppStore {
	state: AppState;
	setIdentity: (identity: IdentityView | null) => void;
	setCircles: (circles: CircleView[]) => void;
	addCircle: (circle: CircleView) => void;
	removeCircle: (code: string) => void;
	pushNotchMessage: (message: NotchMessage) => void;
	clearNotchMessages: () => void;

	// Async actions that call the main process.
	joinCircle: (code: string, relayUrl?: string) => Promise<void>;
	leaveCircle: (code: string) => Promise<void>;
	sendChat: (code: string, text: string) => Promise<void>;
	updateProfile: (displayName: string, avatar?: string) => Promise<void>;
	setRelayUrl: (code: string, relayUrl: string) => Promise<void>;
}

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<AppState>({
		identity: null,
		circles: [],
		notchMessages: [],
	});

	const setIdentity = useCallback((identity: IdentityView | null) => {
		setState((s) => ({ ...s, identity }));
	}, []);

	const setCircles = useCallback((circles: CircleView[]) => {
		setState((s) => ({ ...s, circles }));
	}, []);

	const addCircle = useCallback((circle: CircleView) => {
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

	const joinCircle = useCallback(async (_code: string, _relayUrl?: string) => {
		// TODO: wire to main-process session store and RelayClient in Phase 4.
		throw new Error('joinCircle is not implemented yet');
	}, []);

	const leaveCircle = useCallback(async (_code: string) => {
		// TODO: wire to main-process session store and RelayClient in Phase 4.
		throw new Error('leaveCircle is not implemented yet');
	}, []);

	const sendChat = useCallback(async (_code: string, _text: string) => {
		// TODO: wire to main-process crypto + relay in Phase 4.
		throw new Error('sendChat is not implemented yet');
	}, []);

	const updateProfile = useCallback(async (_displayName: string, _avatar?: string) => {
		// TODO: wire to main-process identity store in Phase 4.
		throw new Error('updateProfile is not implemented yet');
	}, []);

	const setRelayUrl = useCallback(async (_code: string, _relayUrl: string) => {
		// TODO: wire to main-process session store in Phase 4.
		throw new Error('setRelayUrl is not implemented yet');
	}, []);

	const store: AppStore = {
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
		updateProfile,
		setRelayUrl,
	};

	return <AppContext.Provider value={store}>{children}</AppContext.Provider>;
}

export function useAppStore(): AppStore {
	const ctx = useContext(AppContext);
	if (!ctx) {
		throw new Error('useAppStore must be used inside <AppProvider>');
	}
	return ctx;
}
