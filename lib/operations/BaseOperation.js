const { scope } = require('../XPoolDebug');
const { shortId } = require('../utils/IdUtils');

const AsyncLatch = require('../utils/AsyncLatch');

class StopOperation {

  #id;
  #latch = new AsyncLatch();

  constructor(id = shortId()) {
    this.#id = id;
  }

  get initiated() {
    return this.#latch.activated;
  }

  async run(fn) {
    await scope(`${this.name}[${this.#id}]`, async () => {
      this.#latch.activate();
      let result;
      try {
        result = await fn();
      } finally {
        this.#latch.yield(result);
      }
    });
  }

  async wait() {
    return this.#latch.block();
  }

  finalise(...args) {
    return this.#latch.yield(...args);
  }
}

module.exports = StopOperation;
