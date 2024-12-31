const { XPoolEvents } = require('../..');

class EventLog {
  #records = [];

  constructor(emitter, candidates = Object.values(XPoolEvents)) {
    if (this.#hasDuplicates(candidates)) throw new Error(`Candidate events contains duplicates: [${this.#findDuplicates(candidates).join(', ')}]`);
    candidates.forEach((event) => {
      emitter.on(event, (...args) => {
        this.#records.push({ event, payload: args, timestamp: Date.now() });
      });
    });
  }

  get events() {
    return this.#records.map(({ event }) => event);
  }

  get records() {
    return this.#records;
  }

  #hasDuplicates(candidates) {
    return this.#findDuplicates(candidates).length > 0;
  }

  #findDuplicates(candidates) {
    return [...new Set(candidates.filter((item, index) => candidates.indexOf(item) !== index))].map((symbol) => symbol.description);
  }
}

module.exports = EventLog;
