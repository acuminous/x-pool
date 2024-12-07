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

  async validate(pool, resource) {
    const d = this.findDefinition(resource);
    d.validated = new Date();
    if (d.validateDelay) await scheduler.wait(d.validateDelay);
    if (d.validateError) throw d.validateError instanceof Error ? d.validateError : new Error(d.validateError);
  }

  async destroy(pool, resource) {
    const d = this.findDefinition(resource);
    d.destroyed = new Date();
    if (d.destroyDelay) await scheduler.wait(d.destroyDelay);
    if (d.destroyError) throw d.destroyError instanceof Error ? d.destroyError : new Error(d.destroyError);
  }

  findDefinition(resource) {
    const d = this.#definitions.find((d) => d.resource === resource);
    if (!d) throw new Error('Resource not found', resource);
    return d;
  }
}

module.exports = TestFactory;
