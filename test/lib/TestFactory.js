const { setTimeout } = require('node:timers/promises');

module.exports = class TestFactory {

  constructor(resources = []) {
    this._resources = Array.from(resources);
  }

  async create() {
    const resource = this._resources.shift();
    if (resource.createDelay) await setTimeout(resource.createDelay);
    if (resource.createError) throw new Error(resource.createError);
    return resource.value || resource;
  }

  async validate(resource) {
    if (resource.validateError) throw new Error(resource.validateError);
  }

  async destroy() {
  }
};
