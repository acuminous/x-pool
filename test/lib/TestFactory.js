const { scheduler } = require('node:timers/promises');

class TestFactory {

	#definitions;
	#index;

	constructor(definitions = []) {
		this.#definitions = definitions;
		this.#index = 0;
	}

	async create() {
		if (this.#index >= this.#definitions.length) throw new Error('Test Factory has exhausted all resources');
		const d = this.#definitions[this.#index++];
    if (d.createDelay) await scheduler.wait(d.createDelay);
    if (d.createError) throw d.createError instanceof Error ? d.createError : new Error(d.createError);
		return d.resource;
	}

  async destroy(resource) {
    const d = this.findDefinition(resource);
    d.destroyed = new Date();
    if (d.destroyDelay) await scheduler.wait(d.destroyDelay);
    if (d.destroyError) throw d.destroyError instanceof Error ? d.destroyError : new Error(d.destroyError);
  }

  findDefinition(resource) {
    return this.#definitions.find((d) => d.resource === resource);
  }
}

module.exports = TestFactory;
