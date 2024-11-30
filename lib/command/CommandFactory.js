const Command = require('./Command');
const AsyncLatch = require('../utils/AsyncLatch');

class CommandFactory {

	#pool;
	#resourceFactory;
	#createTimeout;
	#destroyTimeout;
	#latch;

	constructor(pool, resourceFactory, createTimeout, destroyTimeout) {
		this.#pool = pool
		this.#resourceFactory = resourceFactory;
		this.#createTimeout = createTimeout;
		this.#destroyTimeout = destroyTimeout;
		this.#latch = new AsyncLatch();
	}

	getCreateCommand() {
		return new Command('create resource', this.#pool, (...args) => this.#resourceFactory.create(...args), this.#createTimeout, this.#latch);
	}

	getDestroyCommand() {
		return new Command('destroy resource', this.#pool, (...args) => this.#resourceFactory.destroy(...args), this.#destroyTimeout, this.#latch);
	}

}

module.exports = CommandFactory
