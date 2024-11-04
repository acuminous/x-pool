const { randomUUID } = require('node:crypto');
const debug = require('debug')('XPool:Pool');
const forwardEvents = require('fwd');
const Queue = require('./queue/Queue');
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
  #dormatory;
  #config;
  #startLatch = new AsyncLatch();
  #stopLatch = new AsyncLatch();

  constructor(config = {}) {
    super();
    this.#config = { ...defaults, ...config };
    this.#dormatory = new Dormitory(this.#config.maxSize, this.#commands());
    forwardEvents(this.#dormatory, this);
  }

  async start() {
    if (this.#isStarted()) throw new Error('The pool has already been started');
    if (this.#isStopped()) throw new Error('The pool has already been stopped');

    debug(`Starting pool with ${this.#config.minSize} resources within ${this.#config.startTimeout.toLocaleString()}ms`);
    this.#startLatch.activate();

    try {
      const timeLimit = new TimeLimit('start pool', this.#config.startTimeout);
      await this.#initialiseBays(timeLimit);
      debug('Pool started');
    } finally {
      this.#startLatch.release();
    }
  }

  async stop() {
    if (this.#isStopped()) return this.#stopLatch.block();

    debug(`Stopping pool with ${this.#queue.size.toLocaleString()} queued requests and ${this.#dormatory.size.toLocaleString()} managed resources within ${this.#config.stopTimeout.toLocaleString()}ms`);
    this.#stopLatch.activate();

    try {
      const timeLimit = new TimeLimit('stop pool', this.#config.stopTimeout);
      await this.#gracefulStop(timeLimit);
      debug('Pool stopped');
    } finally {
      this.#stopLatch.release();
    }
  }

  async acquire(id = randomUUID()) {
    if (this.#isStopped()) throw new Error('The pool has already been stopped');

    debug(`Acquiring resource for request [${id}]`);
    const timeLimit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
    const request = this.#enqueue(id, (request) => this.#handleAcquire(request))
    timeLimit.onTimeout(() => request.abort());
    return timeLimit.restrict(request.block());
  }

  async release(resource) {
    const bay = this.#dormatory.locate(resource);
    if (!bay) return;
    this.#dormatory.release(bay);
    this.#check();
  }

  stats() {
    return { queued: this.#queue.size, ...this.#dormatory.stats() }
  }

  #isStarted() {
    return this.#startLatch.isActive()
  }

  #isStopped() {
    return this.#stopLatch.isActive()
  }

  async #initialiseBays(timeLimit) {
    const promises = PromiseUtils.times(this.#config.minSize, () => {
      const request = this.#enqueue(randomUUID(), (request) => this.#handleInitialise(request));
      timeLimit.onTimeout(() => request.abort());
      return request.block();
    });
    await timeLimit.restrict(promises);
  }

  async #handleInitialise(request) {
    debug(`Initialising resource for request [${request.id}]`);
    const bay = this.#dormatory.extend().reserve(request);
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
    const bay = this.#dormatory.ensure().reserve(request);
    try {
      const resource = await bay.acquire();
      this.#dequeue(request, resource);
    } catch (error) {
      debug(`Error acquiring resource for request [${request.id}]`, error);
      this.#requeue(request);
      await this.#destroy(bay);
    }
  }

  #enqueue(id, handler) {
    const request = this.#queue.add(id, handler);
    this.#check();
    return request;
  }

  async #requeue(request) {
    request.requeue();
    this.#check();
  }

  #dequeue(request, resource) {
    request.dequeue();
    request.release(resource);
  }

  #check() {
    if (this.#dormatory.hasCapacity()) this.#queue.check();
  }

  async #destroy(bay) {
    await this.#dormatory.destroy(bay);
    this.#check();
  }

  async #gracefulStop(timeLimit) {
    const promise = new Promise(async (resolve) => {
      await this.#startLatch.block();
      debug('Waiting for queue to drain');
      await this.#queue.drain();
      debug('Waiting for resources to be destroyed');
      this.#dormatory.stop(this.#stopLatch);
      await this.#stopLatch.block();
      resolve();
    });
    await timeLimit.restrict(promise);
  }

  #commands() {
    return {
      create: new CreateCommand(this, this.#config.factory, this.#config.createTimeout),
      destroy: new DestroyCommand(this, this.#config.factory, this.#config.destroyTimeout),
    }
  }
}

module.exports = Pool;
