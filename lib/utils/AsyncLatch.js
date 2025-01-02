class AsyncLatch {

  #promise;
  #resolve;

  get activated() {
    return Boolean(this.#promise);
  }

  activate() {
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
    return this;
  }

  async block() {
    if (!this.activated) return;
    return this.#promise;
  }

  yield(...args) {
    if (!this.activated) return;
    this.#resolve(...args);
  }
}

module.exports = AsyncLatch;
