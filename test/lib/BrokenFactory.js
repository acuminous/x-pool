const { scheduler } = require('node:timers/promises');

class BrokenFactory {

  async create() {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }

  async validate(pool, resource) {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }

  async reset(pool, resource) {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }

  async destroy(pool, resource) {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }
}

module.exports = BrokenFactory;
