const Command = require('./Command');

class CommandFactory {

	#pool;
	#resourceFactory;
	#createTimeout;
	#destroyTimeout;

	constructor(pool, resourceFactory, createTimeout, destroyTimeout) {
		this.#pool = pool
		this.#resourceFactory = resourceFactory;
		this.#createTimeout = createTimeout;
		this.#destroyTimeout = destroyTimeout;
	}

	getCreateCommand() {
		return new Command('create resource', this.#pool, (...args) => this.#resourceFactory.create(...args), this.#createTimeout);
	}

	getDestroyCommand() {
		return new Command('destroy resource', this.#pool, (...args) => this.#resourceFactory.destroy(...args), this.#destroyTimeout);
	}

}

module.exports = CommandFactory
