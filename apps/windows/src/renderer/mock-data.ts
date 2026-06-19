/**
 * @deprecated All exports in this file are dead. PaletteWindow and
 * NotchWidget now read from the live `AppState` store instead of these
 * fixtures. The interfaces (`Circle`, `Member`, `Message`, `Recipient`) and
 * the `circles`/`recipients`/`sampleMessage` constants should all be removed
 * in a follow-up cleanup pass. Left in place for now to keep this change
 * minimal and reviewable.
 */
export interface Circle {
	code: string;
	isConnected: boolean;
	members: Member[];
	color: string;
}

export interface Member {
	id: string;
	label: string;
}

export interface Message {
	sender: string;
	text: string;
	isDirect: boolean;
	group: string;
	groupColor: string;
}

export interface Recipient {
	id: string;
	label: string;
	circle: string;
	isEveryone: boolean;
}

export const circles: Circle[] = [
	{
		code: 'lunar-owl',
		isConnected: true,
		members: [
			{ id: 'alice', label: 'Alice' },
			{ id: 'bob', label: 'Bob' },
		],
		color: '#3b82f6',
	},
	{
		code: 'solar-kite',
		isConnected: false,
		members: [{ id: 'carol', label: 'Carol' }],
		color: '#a855f7',
	},
];

export const sampleMessage: Message = {
	sender: 'Alice',
	text: 'Hey everyone, the new Windows build is looking great! 🪟',
	isDirect: false,
	group: 'lunar-owl',
	groupColor: '#3b82f6',
};

export const recipients: Recipient[] = [
	{ id: 'all-lunar', label: 'Everyone in lunar-owl', circle: 'lunar-owl', isEveryone: true },
	{ id: 'alice', label: 'Alice', circle: 'lunar-owl', isEveryone: false },
	{ id: 'bob', label: 'Bob', circle: 'lunar-owl', isEveryone: false },
	{ id: 'all-solar', label: 'Everyone in solar-kite', circle: 'solar-kite', isEveryone: true },
	{ id: 'carol', label: 'Carol', circle: 'solar-kite', isEveryone: false },
];
