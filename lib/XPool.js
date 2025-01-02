const XPoolEvents = require('./XPoolEvents');
const XPoolConfig = require('./XPoolConfig');
const { scope, debug } = require('./XPoolDebug');
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
const { shortId } = require('./utils/IdUtils');

class XPool extends SafeEventEmitter {

  #queue;
  #repository;
  #config;
  #startRequest = new StartRequest();
  #stopRequest = new StopRequest();

  constructor(config) {
    super();
    this.#config = XPoolConfig.applyDefaults(config);
    this.#queue = this.#createQueue();
    this.#repository = this.#createRepository();
  }

  async start() {
    if (this.#startRequest.initiated) throw new Error('The pool has already been started');
    if (this.#stopRequest.initiated) throw new Error('The pool has already been stopped');

    await scope('start', async () => {
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
    });
  }

  async stop() {
    if (this.#startRequest.initiated) await this.#startRequest.wait();
    if (this.#stopRequest.initiated) return this.#stopRequest.wait();

    await scope('stop', async () => {
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
    });
  }

  async acquire(requestId = shortId()) {
    if (this.#stopRequest.initiated) throw new Error('The pool has been stopped');

    return scope(`acquire:${requestId}`, () => {
      const timeLimit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
      const handler = (request) => this.#handleAcquire(request);
      const request = this.#createAcquireRequest(requestId, handler);
      this.#enqueue(request);
      timeLimit.onTimeout(() => this.#abortAcquire(request));
      return timeLimit.restrict(request.wait());
    });
  }

  async release(resource) {
    await scope('release', async () => {
      const bay = this.#repository.locate(resource);
      try {
        await bay.reset();
        bay.release();
      } catch (error) {
        debug('Error releasing resource', error);
      } finally {
        this.#checkQueue();
        this.#checkStop();
      }
    });
  }

  async destroy(resource) {
    await scope('destroy', async () => {
      const bay = this.#repository.locate(resource);
      await bay.destroy();
      this.#checkQueue();
      this.#checkReplenish();
      this.#checkStop();
    });
  }

  async with(fn, requestId = shortId()) {
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
      const request = this.#createAcquireRequest(shortId(), handler);
      this.#enqueue(request);
      timeLimit.onTimeout(() => request.abort());
      return request.wait();
    }, this.#config.maxConcurrency);
  }

  async #handleInitialise(request) {
    await scope(`initialise:${request.id}`, async () => {
      debug('Initialising resource');
      const bay = this.#repository.extend().reserve(request);
      try {
        await bay.provision();
        await bay.validate();
        await bay.release();
        this.#dequeue(request);
      } catch (error) {
        debug('Error initialising resource', error);
        this.#requeue(request);
      }
    });
  }

  async #handleAcquire(request) {
    debug('Acquiring resource');
    const bay = this.#repository.ensure().reserve(request);
    try {
      await bay.provision();
      await bay.validate();
      const resource = await bay.acquire();
      this.#dequeue(request, resource);
      this.#checkReplenish();
    } catch (error) {
      debug('Error acquiring resource', error);
      this.#requeue(request);
    }
  }

  #abortAcquire(request) {
    const timeout = this.#config.acquireTimeout;
    const error = new Error(`Acquire timed out after ${timeout.toLocaleString()}ms`);
    request.abort(error);
    this.emit(XPoolEvents.ACQUISITION_TIMEOUT, { timeout, requestId: request.id });
  }

  #enqueue(request) {
    this.#queue.add(request);
    this.#checkQueue();
  }

  async #requeue(request) {
    await request.requeue();
    this.#checkQueue();
  }

  #dequeue(request, resource) {
    request.dequeue(resource);
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
    const { minPoolSize, maxPoolSize, minIdleResources, validate, reset } = this.#config;
    const repository = new Repository({ minPoolSize, maxPoolSize, minIdleResources, validate, reset }, this.#createCommandFactory());
    repository.forwardEvents(this);
    return repository;
  }

  #createAcquireRequest(id, handler) {
    const { backoffInitialValue, backoffFactor, backoffMaxValue } = this.#config;
    const backoff = new ExponentialBackoff(backoffInitialValue, backoffFactor, backoffMaxValue);
    return new AcquireRequest(id, handler, backoff);
  }

  #createCommandFactory() {
    const { factory, createTimeout, validateTimeout, resetTimeout, destroyTimeout } = this.#config;
    return new CommandFactory(this, { factory, createTimeout, validateTimeout, resetTimeout, destroyTimeout });
  }
}

module.exports = XPool;
