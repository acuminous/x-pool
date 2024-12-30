const { scheduler } = require('node:timers/promises');

class UnreliableFactory {

  async create() {
    return operation(1);
  }

  async validate() {
    await operation();
  }

  async reset() {
    await operation();
  }

  async destroy() {
    await operation();
  }
}

function operation(result) {
  return new Promise((resolve, reject) => {
    const delay = shouldFail() ? 2000 : getDelay(100, 200);
    scheduler.wait(delay).then(() => {
      if (shouldFail()) return reject(new Error('Factory Error'));
      resolve(result);
    });
  });
}

module.exports = UnreliableFactory;

function shouldFail() {
  return Math.floor(Math.random() * 100) < 50;
}

function getDelay(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}
