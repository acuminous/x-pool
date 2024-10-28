class QueueStats {

  #queued = 0;
  #dispatched = 0;

  isDrained() {
    return this.#queued === 0;
  }

  queued() {
    this.#queued++;
  }

  dispatched() {
    this.#queued--;
    this.#dispatched++;
  }

  requeued() {
    this.#queued++;
    this.#dispatched--;
  }

  removedFromQueued() {
    this.#queued--;
  }

  removedFromDispatched() {
    this.#dispatched--;
  }

  toJSON() {
    return { queued: this.#queued, dispatched: this.#dispatched }
  }
}

module.exports = QueueStats;
