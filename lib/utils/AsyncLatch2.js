class AsyncLatch2 {

  #promise;
  #resolve;

  constructor() {
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  async block() {
    return await this.#promise;
  }

  release(...args) {
    this.#resolve(...args);
  }
}

module.exports = AsyncLatch2;
