const { randomUUID } = require('node:crypto');
const debug = require('debug')('XPool:Pool');
const forwardEvents = require('fwd');
const Queue = require('./Queue');
const Dormitory = require('./Dormitory');
const CreateCommand = require('./commands/CreateCommand');
const DestroyCommand = require('./commands/DestroyCommand');
const SafeEventEmitter = require('./utils/SafeEventEmitter');
const TimeLimit = require('./utils/TimeLimit');
const PromiseUtils = require('./utils/PromiseUtils');
const AsyncLatch = require('./utils/AsyncLatch');

const defaults = {
  minSize: 0,
  maxSize: Infinity,
  startTimeout: 5000,
  stopTimeout: 5000,
  acquireTimeout: 5000,
  createTimeout: 1000,
  destroyTimeout: 1000,
};

class Pool extends SafeEventEmitter {

  #queue = new Queue();
  #dorm;
  #config;
  #started;
  #stopped;

  constructor(config = {}) {
    super();
    this.#config = { ...defaults, ...config };
    this.#dorm = new Dormitory(this.#config.maxSize, this.#commands());
    forwardEvents(this.#dorm, this);
  }

  async start() {
    if (this.#started) throw new Error('The pool has already been started');
    if (this.#stopped) throw new Error('The pool has been stopped');

    debug(`Starting pool within ${this.#config.startTimeout}`);
    this.#started = new AsyncLatch();

    const limit = new TimeLimit('start pool', this.#config.startTimeout);
    try {
      await this.#initialiseBerts(limit);
    } finally {
      this.#started.release();
    }
  }

  async stop() {
    if (this.#stopped) return this.#stopped.block();
    this.#stopped = new AsyncLatch();
    if (!this.#started) return;

    debug(`Stopping pool within ${this.#config.stopTimeout}ms`);

    const limit = new TimeLimit('stop pool', this.#config.stopTimeout);
    await this.#gracefulStop(limit);
  }

  async acquire(id = randomUUID()) {
    if (this.#stopped) throw new Error('The pool has been stopped');
    debug(`Acquiring resource for request [${id}]`);
    const limit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
    const acquireResource = this.#enqueue(id, limit, (request) => this.#handleAcquire(request))
    return limit.restrict(acquireResource);
  }

  async release(resource) {
    const berth = this.#dorm.locate(resource);
    if (!berth) return;
    this.#dorm.release(berth);
    this.#check();
  }

  stats() {
    const queueStats = this.#queue.stats();
    const dormStats = this.#dorm.stats();
    return { queued: queueStats.size, ...dormStats }
  }

  async #handleInitialise(request) {
    debug(`Initialising resource for request [${request.id}]`);
    const berth = this.#dorm.extend().reserve(request);
    try {
      await berth.provision();
      this.#dequeue(request);
    } catch (error) {
      debug(`Error initialising resource for request [${request.id}]`, error);
      this.#requeue(request);
      await this.#destroy(berth);
    }
  }

  async #handleAcquire(request) {
    const berth = this.#dorm.ensure().reserve(request);
    try {
      const resource = await berth.acquire();
      this.#dequeue(request, resource);
    } catch (error) {
      debug(`Error acquiring resource for request [${request.id}]`, error);
      if (!request.isAborted()) this.#requeue(request);
      await this.#destroy(berth);
    }
  }

  async #enqueue(id, limit, handler) {
    const request = this.#queue.add(id, handler);
    limit.onTimeout(() => this.#queue.abort(request));
    this.#check();
    return request.block();
  }

  async #requeue(request) {
    this.#queue.requeue(request);
    this.#check();
  }

  async #dequeue(request, resource) {
    this.#queue.remove(request);
    request.release(resource);
  }

  async #check() {
    if (this.#dorm.isFull()) return;
    this.#queue.check();
  }

  async #destroy(berth) {
    await this.#dorm.destroy(berth);
    this.#check();
  }

  #commands() {
    return {
      create: new CreateCommand(this, this.#config.factory, this.#config.createTimeout),
      destroy: new DestroyCommand(this, this.#config.factory, this.#config.destroyTimeout),
    }
  }

  async #initialiseBerts(limit) {
    const promises = PromiseUtils.times(this.#config.minSize, () => {
      return this.#enqueue(randomUUID(), limit, (request) => this.#handleInitialise(request));
    });
    await limit.restrict(promises);
  }

  async #gracefulStop(limit) {
    const promise = new Promise(async (resolve) => {
      await this.#started.block();
      await this.#queue.drain();
      await this.#dorm.stop(this.#stopped);
      await this.#stopped.block();
      resolve();
    });

    await limit.restrict(promise);
  }
}

module.exports = Pool;
