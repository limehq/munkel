export interface Member {
	memberId: string;
	displayName: string;
	avatar?: string;
	joinedAt: string;
}

export interface CircleState {
	code: string;
	groupId: string;
	relayUrl: string;
	isConnected: boolean;
	members: Member[];
	joinedAt: string;
}

export interface IdentityState {
	memberId: string;
	displayName: string;
	avatar?: string;
}

interface AppState {
	identity: IdentityState | null;
	circles: Map<string, CircleState>;
}

const state: AppState = {
	identity: null,
	circles: new Map(),
};

export function setIdentity(identity: IdentityState): void {
	state.identity = identity;
}

export function getIdentity(): IdentityState | null {
	return state.identity;
}

export function joinCircle(circle: CircleState): void {
	state.circles.set(circle.code, circle);
}

export function leaveCircle(code: string): boolean {
	return state.circles.delete(code);
}

export function getCircle(code: string): CircleState | undefined {
	return state.circles.get(code);
}

export function getState(): { identity: IdentityState | null; circles: CircleState[] } {
	return {
		identity: state.identity,
		circles: Array.from(state.circles.values()),
	};
}

export function updateCircleConnection(code: string, isConnected: boolean): void {
	const circle = state.circles.get(code);
	if (circle) {
		circle.isConnected = isConnected;
	}
}

export function addMember(code: string, member: Member): void {
	const circle = state.circles.get(code);
	if (!circle) return;
	const exists = circle.members.find((m) => m.memberId === member.memberId);
	if (!exists) {
		circle.members.push(member);
	}
}

export function removeMember(code: string, memberId: string): void {
	const circle = state.circles.get(code);
	if (circle) {
		circle.members = circle.members.filter((m) => m.memberId !== memberId);
	}
}
