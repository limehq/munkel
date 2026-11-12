export class FakeTimers {
	private now = 0;
	private nextId = 1000;
	private timers = new Map<
		number,
		{ fn: () => void; time: number; delay: number; repeat: boolean }
	>();
	private original = {
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
		setInterval: globalThis.setInterval,
		clearInterval: globalThis.clearInterval,
		Date_now: Date.now,
	};

	install() {
		globalThis.setTimeout = ((fn: () => void, delay = 0) =>
			this.add(fn, delay, false)) as typeof globalThis.setTimeout;
		globalThis.clearTimeout = ((id: number | undefined) => this.remove(id)) as typeof globalThis.clearTimeout;
		globalThis.setInterval = ((fn: () => void, delay = 0) =>
			this.add(fn, delay, true)) as typeof globalThis.setInterval;
		globalThis.clearInterval = ((id: number | undefined) => this.remove(id)) as typeof globalThis.clearInterval;
		Date.now = () => this.now;
	}

	restore() {
		globalThis.setTimeout = this.original.setTimeout;
		globalThis.clearTimeout = this.original.clearTimeout;
		globalThis.setInterval = this.original.setInterval;
		globalThis.clearInterval = this.original.clearInterval;
		Date.now = this.original.Date_now;
	}

	advance(ms: number) {
		this.now += ms;
		this.runDue();
	}

	private add(fn: () => void, delay: number, repeat: boolean): number {
		const id = this.nextId++;
		this.timers.set(id, { fn, time: this.now + delay, delay, repeat });
		return id;
	}

	private remove(id: number | undefined) {
		if (id !== undefined) {
			this.timers.delete(id);
		}
	}

	private runDue() {
		const due = [...this.timers.entries()]
			.filter(([, timer]) => timer.time <= this.now)
			.sort((a, b) => a[1].time - b[1].time);

		for (const [id, timer] of due) {
			if (!this.timers.has(id)) continue;
			if (timer.repeat) {
				timer.time += timer.delay;
			} else {
				this.timers.delete(id);
			}
			timer.fn();
		}
	}
}
