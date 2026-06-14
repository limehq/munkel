export class RelayClient {
	private relayURL: string;
	private socket: WebSocket | null = null;

	constructor(relayURL: string) {
		this.relayURL = relayURL;
	}

	async connect(): Promise<void> {
		// TODO: implement WebSocket connection in Phase 4.
		throw new Error('RelayClient.connect() is not implemented yet');
	}

	disconnect(): void {
		// TODO: implement graceful disconnect in Phase 4.
		this.socket = null;
	}

	async send(payload: string): Promise<void> {
		// TODO: implement encrypted send in Phase 4.
		throw new Error('RelayClient.send() is not implemented yet');
	}
}
