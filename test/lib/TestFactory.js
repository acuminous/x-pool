const { scheduler } = require('node:timers/promises');

module.exports = class TestFactory {

  constructor(resourceDefinitions = []) {
    this._resourceDefinitions = resourceDefinitions.map((rd) => (typeof rd === 'string' ? { value: rd } : { value: 'X', ...rd }));
    this._index = 0;
  }

  async create() {
    if (this._index >= this._resourceDefinitions.length) throw new Error('Test Factory has exhausted all resources');
    const rd = this._resourceDefinitions[this._index++];
    if (rd.createDelay) await scheduler.wait(rd.createDelay);
    if (rd.createError) throw rd.createError instanceof Error ? rd.createError : new Error(rd.createError);
    return rd.value;
  }

  async validate(resource) {
    const rd = this._findResourceDefinition(resource);
    rd.validated = new Date();
    if (rd.validateError) throw rd.validateError instanceof Error ? rd.validateError : new Error(rd.validateError);
  }

  async destroy(resource) {
    const rd = this._findResourceDefinition(resource);
    rd.destroyed = new Date();
    if (rd.destroyDelay) await scheduler.wait(rd.destroyDelay);
    if (rd.destroyError) throw rd.destroyError instanceof Error ? rd.destroyError : new Error(rd.destroyError);
  }

  _findResourceDefinition(resource) {
    return this._resourceDefinitions.find((rd) => rd.value === resource);
  }

  wasDestroyed(resource) {
    const rd = this._findResourceDefinition(resource);
    return rd.destroyed;
  }
};
