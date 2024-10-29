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
  #startLatch = new AsyncLatch();
  #stopLatch = new AsyncLatch();

  constructor(config = {}) {
    super();
    this.#config = { ...defaults, ...config };
    this.#dorm = new Dormitory(this.#config.maxSize, this.#commands());
    forwardEvents(this.#dorm, this);
  }

  async start() {
    if (this.#startLatch.isActive()) throw new Error('The pool has already been started');
    if (this.#stopLatch.isActive()) throw new Error('The pool has been stopped');

    debug(`Starting pool within ${this.#config.startTimeout}`);
    this.#startLatch.activate();

    const limit = new TimeLimit('start pool', this.#config.startTimeout);
    try {
      await this.#initialiseBerths(limit);
    } finally {
      this.#startLatch.release();
    }
  }

  async stop() {
    if (this.#stopLatch.isActive()) return this.#stopLatch.block();

    debug(`Stopping pool within ${this.#config.stopTimeout}ms`);
    this.#stopLatch.activate();

    const limit = new TimeLimit('stop pool', this.#config.stopTimeout);
    await this.#gracefulStop(limit);
  }

  async acquire(id = randomUUID()) {
    if (this.#stopLatch.isActive()) throw new Error('The pool has been stopped');
    debug(`Acquiring resource for request [${id}]`);
    const limit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
    const acquireResource = this.#enqueue(id, limit, (request) => this.#handleAcquire(request))
    return limit.restrict(acquireResource);
  }

  async release(resource) {
    const bay = this.#dorm.locate(resource);
    if (!bay) return;
    this.#dorm.release(bay);
    this.#check();
  }

  stats() {
    const { queued } = this.#queue.stats();
    return { queued, ...this.#dorm.stats() }
  }

  async #handleInitialise(request) {
    debug(`Initialising resource for request [${request.id}]`);
    const bay = this.#dorm.extend().reserve(request);
    try {
      await bay.provision();
      this.#dequeue(request);
    } catch (error) {
      debug(`Error initialising resource for request [${request.id}]`, error);
      this.#requeue(request);
      await this.#destroy(bay);
    }
  }

  async #handleAcquire(request) {
    const bay = this.#dorm.ensure().reserve(request);
    try {
      const resource = await bay.acquire();
      this.#dequeue(request, resource);
    } catch (error) {
      debug(`Error acquiring resource for request [${request.id}]`, error);
      if (!request.isAborted()) this.#requeue(request);
      await this.#destroy(bay);
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

  async #destroy(bay) {
    await this.#dorm.destroy(bay);
    this.#check();
  }

  #commands() {
    return {
      create: new CreateCommand(this, this.#config.factory, this.#config.createTimeout),
      destroy: new DestroyCommand(this, this.#config.factory, this.#config.destroyTimeout),
    }
  }

  async #initialiseBerths(limit) {
    const promises = PromiseUtils.times(this.#config.minSize, () => {
      return this.#enqueue(randomUUID(), limit, (request) => this.#handleInitialise(request));
    });
    await limit.restrict(promises);
  }

  async #gracefulStop(limit) {
    const promise = new Promise(async (resolve) => {
      await this.#startLatch.block();
      await this.#queue.drain();
      await this.#dorm.stop(this.#stopLatch);
      await this.#stopLatch.block();
      resolve();
    });

    await limit.restrict(promise);
  }
}

module.exports = Pool;
