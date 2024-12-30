const { scheduler } = require('node:timers/promises');

class BrokenFactory {

  async create() {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }

  async validate() {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }

  async reset() {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }

  async destroy() {
    await scheduler.wait(100);
    throw new Error('Factory Error');
  }
}

module.exports = BrokenFactory;
