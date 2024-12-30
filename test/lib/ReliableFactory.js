const { scheduler } = require('node:timers/promises');

class ReliableFactory {

  async create() {
    await scheduler.wait(100);
    return 1;
  }

  async validate(pool, resource) {
    await scheduler.wait(100);
    return true;
  }

  async reset(pool, resource) {
    await scheduler.wait(100);
  }

  async destroy(pool, resource) {
    await scheduler.wait(100);
  }
}

module.exports = ReliableFactory;
