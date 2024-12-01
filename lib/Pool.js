const { randomUUID } = require('node:crypto');
const debug = require('debug')('XPool:Pool');
const AcquireQueue = require('./AcquireQueue');
const BayRepository = require('./BayRepository');
const CommandFactory = require('./command/CommandFactory');
const StartRequest = require('./requests/StartRequest');
const StopRequest = require('./requests/StopRequest');
const SafeEventEmitter = require('./utils/SafeEventEmitter');
const TimeLimit = require('./utils/TimeLimit');
const PromiseUtils = require('./utils/PromiseUtils');

const defaults = {
  minPoolSize: 0,
  maxPoolSize: Infinity,
  maxQueueSize: Infinity,
  startTimeout: 5000,
  stopTimeout: 5000,
  acquireTimeout: 5000,
  createTimeout: 1000,
  destroyTimeout: 1000,
};

class Pool extends SafeEventEmitter {

  #queue;
  #repository;
  #config;
  #startRequest = new StartRequest();
  #stopRequest = new StopRequest();

  constructor(config = {}) {
    super();
    this.#config = { ...defaults, ...config };
    this.#queue = new AcquireQueue(this.#config.maxQueueSize)
    this.#repository = new BayRepository(this.#config.maxPoolSize, this.#createCommandFactory())
    this.#repository.forwardEvents(this);
  }

  async start() {
    if (this.#startRequest.initiated) throw new Error('The pool has already been started');
    if (this.#stopRequest.initiated) throw new Error('The pool has already been stopped');

    debug(`Starting pool with ${this.#config.minPoolSize.toLocaleString()} resources within ${this.#config.startTimeout.toLocaleString()}ms`);
    this.#startRequest.initiate();

    try {
      const timeLimit = new TimeLimit('start pool', this.#config.startTimeout);
      const operations = this.#initialiseBays(timeLimit);
      await timeLimit.restrict(operations);
      debug('Pool started');
    } finally {
      this.#startRequest.finalise();
    }
  }

  async stop() {
    if (this.#startRequest.initiated) await this.#startRequest.wait();
    if (this.#stopRequest.initiated) return this.#stopRequest.wait();

    debug(`Stopping pool with ${this.#queue.size.toLocaleString()} queued requests and ${this.#repository.size.toLocaleString()} resources within ${this.#config.stopTimeout.toLocaleString()}ms`);
    this.#stopRequest.initiate();

    try {
      const timeLimit = new TimeLimit('stop pool', this.#config.stopTimeout);
      const operations = this.#stopGracefully();
      await timeLimit.restrict(operations);
      debug('Pool stopped');
    } finally {
      this.#stopRequest.finalise();
    }
  }

  async acquire(requestId = randomUUID()) {
    if (this.#stopRequest.initiated) throw new Error('The pool has been stopped');

    const timeLimit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
    const request = this.#enqueue(requestId, (request) => this.#handleAcquire(request))
    timeLimit.onTimeout(() => this.#abortAcquire(request));
    return timeLimit.restrict(request.wait());
  }

  async release(resource) {
    const bay = this.#repository.locate(resource);
    await bay.release();
    this.#checkQueue();
    await this.#checkPool();
  }

  async destroy(resource) {
    const bay = this.#repository.locate(resource);
    await bay.destroy();
    this.#checkQueue();
    await this.#checkPool();
  }

  stats() {
    return { queued: this.#queue.size, ...this.#repository.stats() }
  }

  async #initialiseBays(timeLimit) {
    const numberOfBays = this.#config.minPoolSize - this.#repository.size
    return PromiseUtils.times(numberOfBays, () => {
      const request = this.#enqueue(randomUUID(), (request) => this.#handleInitialise(request));
      timeLimit.onTimeout(() => request.abort());
      return request.wait();
    });
  }

  async #handleInitialise(request) {
    debug(`Initialising resource for request [${request.shortId}]`);
    const bay = this.#repository.extend().reserve(request);
    try {
      await bay.provision();
      await bay.release();
      this.#dequeue(request);
    } catch (error) {
      debug(`Error initialising resource for request [${request.shortId}]\n[cause]: %O`, error);
      this.#requeue(request);
    }
  }

  async #handleAcquire(request) {
    debug(`Acquiring resource for request [${request.shortId}]`);
    const bay = this.#repository.reserve(request);
    try {
      await bay.provision();
      await bay.acquire();
      this.#dequeue(request);
    } catch (error) {
      debug(`Error acquiring resource for request [${request.shortId}]`, error);
      this.#requeue(request);
    }
  }

  #abortAcquire(request) {
    const error = new Error(`Acquire timed out after ${this.#config.acquireTimeout.toLocaleString()}ms`);
    request.abort(error);
    this.#checkQueue();
  }

  #enqueue(requestId, handler) {
    const request = this.#queue.add(requestId, handler);
    this.#checkQueue();
    return request;
  }

  async #requeue(request) {
    request.requeue();
    this.#checkQueue();
  }

  #dequeue(request) {
    request.dequeue();
    this.#checkQueue();
  }

  #checkQueue() {
    if (this.#repository.hasCapacity()) this.#queue.check();
  }

  async #checkPool() {
    if (this.#stopRequest.initiated) return this.#repository.cull();
    if (this.#repository.size < this.#config.minPoolSize) await this.#refillPool();
  }

  async #refillPool() {
    const timeLimit = new TimeLimit('refill pool', Infinity);
    const operations = this.#initialiseBays(timeLimit);
    await timeLimit.restrict(operations);
  }

  async #stopGracefully() {
    return new Promise(async (resolve) => {
      debug(`Waiting for queue to drain`);
      await this.#queue.drain();
      debug(`Waiting for resources to be destroyed`);
      this.#repository.stop(this.#stopRequest);
      await this.#stopRequest.wait();
      resolve();
    });
  }

  #createCommandFactory() {
    return new CommandFactory(this, this.#config.factory, this.#config.createTimeout, this.#config.destroyTimeout);
  }
}

module.exports = Pool;
