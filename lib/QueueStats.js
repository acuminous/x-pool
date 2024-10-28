class QueueStats {
  #queued = 0;
  #dispatched = 0;

  queue() {
    this.#queued++;
  }

  dispatch() {
    this.#queued--;
    this.#dispatched++;
  }

  reset() {
    this.#queued++;
    this.#dispatched--;
  }

  removeQueued(state) {
    this.#queued--;
  }

  removeDispatched() {
		this.#dispatched--;
  }

  isDrained() {
    return this.#queued === 0;
  }

  export() {
    return { queued: this.#queued, dispatched: this.#dispatched }
  }
}

module.exports = QueueStats;
