const { randomUUID } = require('node:crypto');

const AsyncLatch = require('../utils/AsyncLatch2');

class StopRequest extends AsyncLatch {

	#id;

	initiate(id = randomUUID()) {
		this.#id = id;
		super.initiate();
	}

	associate(bay) {}
}

module.exports = StopRequest;
