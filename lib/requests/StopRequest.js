const { randomUUID } = require('node:crypto');

const AsyncLatch = require('../utils/AsyncLatch');

class StopRequest {

	#id;
	#latch = new AsyncLatch();

	constructor(id = randomUUID()) {
		this.#id = id;
	}

  get shortId() {
    return `${this.#id?.substring(0, 4)}`
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

	associate(bay) {}
}

module.exports = StopRequest;
