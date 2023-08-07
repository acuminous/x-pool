const { scheduler } = require('node:timers/promises');

module.exports = class TestFactory {

  constructor(resourceDefinitions = []) {
    this._resourceDefinitions = resourceDefinitions.map((rd) => (typeof rd === 'string' ? { value: rd } : { value: 'X', ...rd }));
    this._index = 0;
  }

  async create() {
    const rd = this._resourceDefinitions[this._index++];
    if (rd.createDelay) await scheduler.wait(rd.createDelay);
    if (rd.createError) throw new Error(rd.createError);
    return rd.value;
  }

  async validate(resource) {
    const rd = this._findResourceDefinition(resource);
    rd.validated = new Date();
    if (rd.validateError) throw new Error(rd.validateError);
  }

  async destroy(resource) {
    const rd = this._findResourceDefinition(resource);
    if (rd.destroyDelay) await scheduler.wait(rd.destroyDelay);
    if (rd.destroyError) throw new Error(rd.destroyError);
    rd.destroyed = new Date();
  }

  _findResourceDefinition(resource) {
    return this._resourceDefinitions.find((rd) => rd.value === resource);
  }

  wasDestroyed(resource) {
    const rd = this._findResourceDefinition(resource);
    return rd.destroyed;
  }
};
