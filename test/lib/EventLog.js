class EventLog {
	#events = [];
	#payloads = [];

	constructor(emitter, candidates) {
		if (this.#hasDuplicates(candidates)) throw new Error(`Candidate events contains duplicates: [${this.#findDuplicates(candidates).join(', ')}]`);
		candidates.forEach((event) => {
			emitter.on(event, (...args) => {
				this.#events.push(event);
				this.#payloads.push(args)
			});
		})
	}

	get events() {
		return this.#events;
	}

	get payloads() {
		return this.#payloads;
	}

	#hasDuplicates(candidates) {
		return this.#findDuplicates(candidates).length > 0;
	}

	#findDuplicates(candidates) {
		return [...new Set(candidates.filter((item, index) => candidates.indexOf(item) !== index))].map((symbol) => symbol.description);
	}
}

module.exports = EventLog;
