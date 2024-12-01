class AsyncLatch {

  #promise;
  #resolve;

  get initiated() {
    return Boolean(this.#promise);
  }

  initiate() {
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
    return this;
  }

  async wait() {
    if (!this.initiated) return;
    await this.#promise;
  }

  finalise(...args) {
    if (!this.initiated) return;
    this.#resolve(...args);
  }
}

module.exports = AsyncLatch;
