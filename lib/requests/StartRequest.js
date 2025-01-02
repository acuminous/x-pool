const { shortId } = require('../utils/IdUtils');
const AsyncLatch = require('../utils/AsyncLatch');

class StartRequest {

  #id;
  #latch = new AsyncLatch();

  constructor(id = shortId()) {
    this.#id = id;
  }

  get id() {
    return this.#id;
  }

  get initiated() {
    return this.#latch.activated;
  }

  initiate() {
    this.#latch.activate();
    return this;
  }

  async wait() {
    return this.#latch.block();
  }

  finalise(...args) {
    return this.#latch.release(...args);
  }
}

module.exports = StartRequest;
