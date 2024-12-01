const { randomUUID } = require('node:crypto');

const AsyncLatch = require('../utils/AsyncLatch2');

class StartRequest extends AsyncLatch {

	#id;

	constructor(id = randomUUID()) {
		super();
		this.#id = id;
	}

  get shortId() {
    return `${this.#id?.substring(0, 4)}`
  }

	associate(bay) {}
}

module.exports = StartRequest;
