const { describe, it, afterEach } = require('zunit');
const { deepStrictEqual: eq, rejects, fail } = require('node:assert');
const { scheduler } = require('node:timers/promises');
const seedrandom = require('seedrandom');
const ReliableFactory = require('./lib/ReliableFactory');
const UnreliableFactory = require('./lib/UnreliableFactory');
const BrokenFactory = require('./lib/BrokenFactory');
const { XPool } = require('..');

const seed = Math.floor(Math.random() * 1000);

describe(`Stress (seed = ${seed})`, () => {

  Math.random = seedrandom(seed);

  it('should work under stress with a reliable factory', async () => {
    const factory = new ReliableFactory();
    await runTest(factory);
  }, { timeout: 300000 });

  it('should work under stress with an unreliable factory', async () => {
    const factory = new UnreliableFactory();
    await runTest(factory);
  }, { timeout: 300000 });

  it('should work under stress with a broken factory', async () => {
    const factory = new BrokenFactory();
    await runTest(factory);
  }, { timeout: 300000 });
});

async function runTest(factory) {
  const pool = new XPool({ maxPoolSize: 1, factory });
  const workers = new Array(1).fill().map((_, index) => new Worker(index + 1, pool));
  const work = workers.map((worker) => worker.run(1));
  await Promise.all(work);
}

class Worker {

  #id;
  #pool;

  constructor(id, pool) {
    this.#id = id;
    this.#pool = pool;
  }

  async run(iterations) {
    for (let i = 0; i < iterations; i++) {
      try {
        const resource = await this.#pool.acquire();
        await scheduler.wait(getRandomInt(100, 200));
        await this.#pool.release(resource);
      } catch (error) {
        if (error.isXPoolError) throw error;
      }
    }
  }
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}
