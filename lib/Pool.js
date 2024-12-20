const { randomUUID } = require('node:crypto');

const debug = require('debug')('XPool:Pool');

const Queue = require('./Queue');
const Repository = require('./Repository');
const CommandFactory = require('./command/CommandFactory');
const StartRequest = require('./requests/StartRequest');
const StopRequest = require('./requests/StopRequest');
const AcquireRequest = require('./acquire/AcquireRequest');
const SafeEventEmitter = require('./utils/SafeEventEmitter');
const TimeLimit = require('./utils/TimeLimit');
const TimeLimitless = require('./utils/TimeLimitless');
const PromiseUtils = require('./utils/PromiseUtils');
const ExponentialBackoff = require('./utils/ExponentialBackoff');

const defaults = {
  minPoolSize: 0,
  maxPoolSize: Infinity,
  minIdleResources: 0,
  maxQueueSize: Infinity,
  maxConcurrency: 5,
  startTimeout: 5000,
  stopTimeout: 5000,
  acquireTimeout: 5000,
  createTimeout: 1000,
  validateTimeout: 1000,
  destroyTimeout: 1000,
  backoffInitialValue: 100,
  backoffFactor: 2,
  backoffMaxValue: 1000,
  validate: 'NEVER',
  validationInterval: Infinity,
  maxIdleDuration: Infinity,
  immunityDuration: 60000,
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
    this.#queue = this.#createQueue();
    this.#repository = this.#createRepository();
  }

  async start() {
    if (this.#startRequest.initiated) throw new Error('The pool has already been started');
    if (this.#stopRequest.initiated) throw new Error('The pool has already been stopped');

    debug(`Starting pool with ${this.#repository.deficit} resources within ${this.#config.startTimeout.toLocaleString()}ms`);
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

    debug(`Stopping pool with ${this.#queue.queued.toLocaleString()} queued requests and ${this.#repository.size.toLocaleString()} resources within ${this.#config.stopTimeout.toLocaleString()}ms`);
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
    const handler = (request) => this.#handleAcquire(request);
    const request = this.#createAcquireRequest(requestId, handler);
    this.#enqueue(request);
    timeLimit.onTimeout(() => this.#abortAcquire(request));
    return timeLimit.restrict(request.wait());
  }

  async release(resource) {
    const bay = this.#repository.locate(resource);
    await bay.release();
    this.#checkQueue();
    this.#checkStop();
  }

  async destroy(resource) {
    const bay = this.#repository.locate(resource);
    await bay.destroy();
    this.#checkQueue();
    this.#checkReplenish();
    this.#checkStop();
  }

  async with(fn, requestId = randomUUID()) {
    const resource = await this.acquire(requestId);
    try {
      return fn(resource);
    } finally {
      await this.release(resource);
    }
  }

  stats() {
    return { queued: this.#queue.queued, ...this.#repository.stats() };
  }

  async #initialiseBays(timeLimit) {
    return PromiseUtils.times(this.#repository.deficit, () => {
      const handler = (request) => this.#handleInitialise(request);
      const request = this.#createAcquireRequest(randomUUID(), handler);
      this.#enqueue(request);
      timeLimit.onTimeout(() => request.abort());
      return request.wait();
    }, this.#config.maxConcurrency);
  }

  async #handleInitialise(request) {
    debug(`Initialising resource for request [${request.shortId}]`);
    const bay = this.#repository.extend().reserve(request);
    try {
      await bay.provision();
      await bay.validate();
      await bay.release();
      this.#dequeue(request);
    } catch (error) {
      debug(`Error initialising resource for request [${request.shortId}]\n[cause]: %O`, error);
      this.#requeue(request);
    }
  }

  async #handleAcquire(request) {
    debug(`Acquiring resource for request [${request.shortId}]`);
    const bay = this.#repository.ensure().reserve(request);
    try {
      await bay.provision();
      await bay.validate();
      await bay.acquire();
      this.#dequeue(request);
      this.#checkReplenish();
    } catch (error) {
      debug(`Error acquiring resource for request [${request.shortId}]`, error);
      this.#requeue(request);
    }
  }

  #abortAcquire(request) {
    const error = new Error(`Acquire timed out after ${this.#config.acquireTimeout.toLocaleString()}ms`);
    request.abort(error);
  }

  #enqueue(request) {
    this.#queue.add(request);
    this.#checkQueue();
  }

  async #requeue(request) {
    await request.requeue();
    this.#checkQueue();
  }

  #dequeue(request) {
    request.dequeue();
    this.#checkQueue();
  }

  #checkReplenish() {
    if (this.#repository.deficit === 0) return;
    setImmediate(async () => {
      const timeLimit = new TimeLimitless('replenish pool');
      const operations = this.#initialiseBays(timeLimit);
      await timeLimit.restrict(operations);
    });
  }

  #checkQueue() {
    if (this.#repository.hasCapacity()) this.#queue.check();
  }

  #checkStop() {
    if (!this.#stopRequest.initiated) return;
    if (!this.#queue.isDrained()) return;
    this.#repository.cull();
  }

  async #stopGracefully() {
    debug('Waiting for queue to drain');
    await this.#queue.drain();

    debug('Waiting for resources to be destroyed');
    this.#repository.stop(this.#stopRequest);
    await this.#stopRequest.wait();
  }

  #createQueue() {
    const { maxQueueSize } = this.#config;
    return new Queue({ maxQueueSize });
  }

  #createRepository() {
    const { minPoolSize, maxPoolSize, minIdleResources } = this.#config;
    const repository = new Repository({ minPoolSize, maxPoolSize, minIdleResources }, this.#createCommandFactory());
    repository.forwardEvents(this);
    return repository;
  }

  #createAcquireRequest(id, handler) {
    const { backoffInitialValue, backoffFactor, backoffMaxValue } = this.#config;
    const backoff = new ExponentialBackoff(backoffInitialValue, backoffFactor, backoffMaxValue);
    return new AcquireRequest(id, handler, this.#config.validate, backoff);
  }

  #createCommandFactory() {
    const { factory, createTimeout, validateTimeout, destroyTimeout } = this.#config;
    return new CommandFactory(this, { factory, createTimeout, validateTimeout, destroyTimeout });
  }
}

module.exports = Pool;
