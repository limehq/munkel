import { GroupSession } from '../src/main/group-session';

const code = process.argv[2] ?? 'interop-test';
const relayUrl = process.env.RELAY_URL ?? 'ws://127.0.0.1:8787';
const memberId = 'windows-interop';

console.log(`[interop] joining ${code} via ${relayUrl}`);

let connected = false;
let received: string[] = [];

const session = await GroupSession.create(
	code,
	relayUrl,
	memberId,
	{ displayName: 'Windows' },
	{
		onStateChange: (state) => {
			connected = state.isConnected;
			console.log('[interop] state:', {
				code: state.code,
				isConnected: state.isConnected,
				members: state.members.length,
			});
		},
		onChat: (payload) => {
			const line = `[interop] chat from ${payload.sender}: ${payload.text}`;
			received.push(line);
			console.log(line);
		},
		onNotch: (message) => {
			console.log('[interop] notch:', message.text);
		},
		getColorIndex: () => 0,
	},
);

session.connect();

// Wait for the welcome frame so the relay recognises us as present.
await waitFor(() => connected, 10_000);

console.log('[interop] connected, sending greeting');
await session.sendChat('Hello from the Windows client!');

// Stay alive long enough for dev-send to reply.
await new Promise((resolve) => setTimeout(resolve, 3000));

session.disconnect();
console.log('[interop] done');
console.log('[interop] received count:', received.length);

function waitFor(condition: () => boolean, timeout: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const check = () => {
			if (condition()) {
				resolve();
				return;
			}
			if (Date.now() - start > timeout) {
				reject(new Error('Timeout waiting for connection'));
				return;
			}
			setTimeout(check, 50);
		};
		check();
	});
}
