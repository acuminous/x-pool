const { randomUUID } = require('node:crypto');
const debug = require('debug')('XPool:Pool');
const Queue = require('./queue/Queue');
const Repository = require('./Repository');
const CommandFactory = require('./command/CommandFactory');
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
  #repository;
  #config;
  #startLatch = new AsyncLatch();
  #stopLatch = new AsyncLatch();

  constructor(config = {}) {
    super();
    this.#config = { ...defaults, ...config };
    this.#repository = new Repository(this.#config.maxSize, this.#createCommandFactory())
    this.#repository.forwardEvents(this);
  }

  async start() {
    if (this.#isStarted()) throw new Error('The pool has already been started');
    if (this.#isStopped()) throw new Error('The pool has already been stopped');

    debug(`Starting pool with ${this.#config.minSize} resources within ${this.#config.startTimeout.toLocaleString()}ms`);
    this.#startLatch.activate();

    try {
      const timeLimit = new TimeLimit('start pool', this.#config.startTimeout);
      const operations = this.#initialiseBays(timeLimit);
      await timeLimit.restrict(operations);
      debug('Pool started');
    } finally {
      this.#startLatch.release();
    }
  }

  async stop() {
    if (this.#isStarted()) await this.#waitUntilStarted();
    if (this.#isStopped()) return this.#waitUntilStopped();

    debug(`Stopping pool with ${this.#queue.size.toLocaleString()} queued requests and ${this.#repository.size.toLocaleString()} managed resources within ${this.#config.stopTimeout.toLocaleString()}ms`);
    this.#stopLatch.activate();

    try {
      const timeLimit = new TimeLimit('stop pool', this.#config.stopTimeout);
      const operations = this.#stopGracefully();
      await timeLimit.restrict(operations);
      debug('Pool stopped');
    } finally {
      this.#stopLatch.release();
    }
  }

  async acquire(requestId = randomUUID()) {
    if (this.#isStopped()) throw new Error('The pool has already been stopped');

    debug(`Acquiring resource for request [${requestId}]`);
    const timeLimit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
    const request = this.#enqueue(requestId, (request) => this.#handleAcquire(request))
    timeLimit.onTimeout(() => this.#abortAcquire(request));
    return timeLimit.restrict(request.block());
  }

  async release(resource) {
    const bay = this.#repository.locate(resource);
    this.#repository.release(bay);
    this.#checkRequestQueue();
  }

  stats() {
    return { queued: this.#queue.size, ...this.#repository.stats() }
  }

  #isStarted() {
    return this.#startLatch.isActive()
  }

  #waitUntilStarted() {
    return this.#startLatch.block()
  }

  #isStopped() {
    return this.#stopLatch.isActive()
  }

  #waitUntilStopped() {
    return this.#stopLatch.block();
  }

  async #initialiseBays(timeLimit) {
    return PromiseUtils.times(this.#config.minSize, () => {
      const request = this.#enqueue(randomUUID(), (request) => this.#handleInitialise(request));
      timeLimit.onTimeout(() => request.abort());
      return request.block();
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
    this.#checkRequestQueue();
  }

  #enqueue(requestId, handler) {
    const request = this.#queue.add(requestId, handler);
    this.#checkRequestQueue();
    return request;
  }

  async #requeue(request) {
    request.requeue();
    this.#checkRequestQueue();
  }

  #dequeue(request) {
    request.dequeue();
    this.#checkRequestQueue();
  }

  #checkRequestQueue() {
    if (this.#repository.hasCapacity()) this.#queue.check();
  }

  async #stopGracefully() {
    return new Promise(async (resolve) => {
      debug('Waiting for queue to drain');
      await this.#queue.drain();
      debug('Waiting for resources to be destroyed');
      this.#repository.stop(this.#stopLatch);
      await this.#stopLatch.block();
      resolve();
    });
  }

  #createCommandFactory() {
    return new CommandFactory(this, this.#config.factory, this.#config.createTimeout, this.#config.destroyTimeout);
  }
}

module.exports = Pool;
