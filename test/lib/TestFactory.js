const { scheduler } = require('node:timers/promises');

module.exports = class TestFactory {

  #resourceDefinitions;
  #index = 0;

  constructor(resourceDefinitions = []) {
    this.#resourceDefinitions = resourceDefinitions.map((rd) => (typeof rd === 'string' ? { value: rd } : { value: 'X', ...rd }));
  }

  async create() {
    if (this.#index >= this.#resourceDefinitions.length) throw new Error('Test Factory has exhausted all resources');
    const rd = this.#resourceDefinitions[this.#index++];
    if (rd.createDelay) await scheduler.wait(rd.createDelay);
    if (rd.createError) throw rd.createError instanceof Error ? rd.createError : new Error(rd.createError);
    return rd.value;
  }

  async validate(resource) {
    const rd = this.#findResourceDefinition(resource);
    rd.validated = new Date();
    if (rd.validateDelay) await scheduler.wait(rd.validateDelay);
    if (rd.validateError) throw rd.validateError instanceof Error ? rd.validateError : new Error(rd.validateError);
  }

  async destroy(resource) {
    const rd = this.#findResourceDefinition(resource);
    if (rd.destroyed) throw new Error(`Resource ${rd.value} was already destroyed`);
    rd.destroyed = new Date();
    if (rd.destroyDelay) await scheduler.wait(rd.destroyDelay);
    if (rd.destroyError) throw rd.destroyError instanceof Error ? rd.destroyError : new Error(rd.destroyError);
  }

  #findResourceDefinition(resource) {
    return this.#resourceDefinitions.find((rd) => rd.value === resource);
  }

  wasDestroyed(resource) {
    const rd = this.#findResourceDefinition(resource);
    return rd.destroyed;
  }
};
