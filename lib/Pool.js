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
  minSize: 0,
  maxSize: Infinity,
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
    this.#queue = new AcquireQueue()
    this.#repository = new BayRepository(this.#config.maxSize, this.#createCommandFactory())
    this.#repository.forwardEvents(this);
  }

  async start() {
    if (this.#startRequest.initiated) throw new Error('The pool has already been started');
    if (this.#stopRequest.initiated) throw new Error('The pool has already been stopped');

    debug(`Starting pool with ${this.#config.minSize} resources within ${this.#config.startTimeout.toLocaleString()}ms`);
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
    this.#checkRequestQueue();
    this.#checkRepository();
  }

  async destroy(resource) {
    const bay = this.#repository.locate(resource);
    await bay.destroy();
    this.#checkRequestQueue();
    this.#checkRepository();
  }

  stats() {
    return { queued: this.#queue.size, ...this.#repository.stats() }
  }

  async #initialiseBays(timeLimit) {
    return PromiseUtils.times(this.#config.minSize, () => {
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

  #checkRepository() {
    if (this.#stopRequest.initiated) this.#repository.cull();
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
