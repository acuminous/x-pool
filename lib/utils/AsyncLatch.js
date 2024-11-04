class AsyncLatch {

  #promise;
  #resolve;

  activate() {
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
    return this;
  }

  isActive() {
    return Boolean(this.#promise);
  }

  async block() {
    if (!this.isActive()) return;
    return await this.#promise;
  }

  release(...args) {
    if (!this.isActive()) return;
    this.#resolve(...args);
  }
}

module.exports = AsyncLatch;
