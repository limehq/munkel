export class ProfileBroadcaster {
	private timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly flush: () => void | Promise<void>) {}

	/**
	 * Schedule a flush after a 1-second debounce. Resets the timer on every
	 * call so rapid changes (e.g. typing a display name) coalesce into one
	 * profile broadcast.
	 */
	trigger(): void {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, 1000);
	}

	/**
	 * Flush immediately and cancel any pending debounced flush.
	 */
	flushNow(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
		void this.flush();
	}
}
