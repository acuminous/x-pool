class TimeLimit {

  #id = null;
  #operation;
  #duration;
  #resolve;
  #onTimeout = () => {};

  constructor(operation, duration) {
    this.#operation = operation;
    this.#duration = duration;
  }

  async restrict(promises) {
    const competitors = [].concat(promises).concat(this.#start());
    return Promise.race(competitors).finally(() => this.abort());
  }

  abort() {
    clearTimeout(this.#id);
    this.#resolve();
  }

  onTimeout(cb) {
    this.#onTimeout = cb;
  }

  async #start() {
    return new Promise((resolve, reject) => {
      this.#resolve = resolve;
      if (this.#duration === Infinity) return;
      this.#id = setTimeout(() => {
        this.#id = null;
        this.#onTimeout();
        reject(new Error(`Failed to ${this.#operation} within ${this.#duration.toLocaleString()}ms`));
      }, this.#duration).unref();
    });
  }
}

module.exports = TimeLimit;
