const { scheduler } = require('node:timers/promises');

class ReliableFactory {

  async create() {
    await scheduler.wait(100);
    return 1;
  }

  async validate() {
    await scheduler.wait(100);
    return true;
  }

  async reset() {
    await scheduler.wait(100);
  }

  async destroy() {
    await scheduler.wait(100);
  }
}

module.exports = ReliableFactory;
