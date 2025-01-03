const XPoolEvents = require('./XPoolEvents');
const XPoolConfig = require('./XPoolConfig');
const { scope, unscope, debug } = require('./XPoolDebug');
const Queue = require('./Queue');
const Repository = require('./Repository');
const CommandFactory = require('./command/CommandFactory');
const { StartOperation, StopOperation, ReleaseOperation, DestroyOperation } = require('./operations');
const AcquireRequest = require('./acquire/AcquireRequest');
const SafeEventEmitter = require('./utils/SafeEventEmitter');
const TimeLimit = require('./utils/TimeLimit');
const TimeLimitless = require('./utils/TimeLimitless');
const PromiseUtils = require('./utils/PromiseUtils');
const ExponentialBackoff = require('./utils/ExponentialBackoff');
const { shortId } = require('./utils/IdUtils');
const EventListenerRegistry = require('./utils/EventListenerRegistry');

class XPool extends SafeEventEmitter {

  #queue;
  #repository;
  #config;
  #startOperation = new StartOperation();
  #stopOperation = new StopOperation();
  #eventListeners = new EventListenerRegistry();

  constructor(config) {
    super();
    this.#config = XPoolConfig.applyDefaults(config);
    this.#queue = this.#createQueue();
    this.#repository = this.#createRepository();
  }

  async start() {
    if (this.#startOperation.initiated) throw new Error('The pool has already been started');
    if (this.#stopOperation.initiated) throw new Error('The pool has already been stopped');

    await this.#startOperation.run(async () => {
      debug(`Starting pool with ${this.#repository.deficit} resources within ${this.#config.startTimeout.toLocaleString()}ms`);
      const timeLimit = new TimeLimit('start pool', this.#config.startTimeout);
      const operations = this.#initialiseBays(timeLimit);
      await timeLimit.restrict(operations);
      this.#addEventListeners();
      this.emit(XPoolEvents.POOL_STARTED);
      debug('Pool started');
    });
  }

  async stop() {
    if (this.#startOperation.initiated) await this.#startOperation.wait();
    if (this.#stopOperation.initiated) return this.#stopOperation.wait();

    await this.#stopOperation.run(async () => {
      debug(`Stopping pool with ${this.#queue.queued.toLocaleString()} queued requests and ${this.#repository.size.toLocaleString()} resources within ${this.#config.stopTimeout.toLocaleString()}ms`);
      const timeLimit = new TimeLimit('stop pool', this.#config.stopTimeout);
      const operations = this.#stopGracefully();
      await timeLimit.restrict(operations);
      this.emit(XPoolEvents.POOL_STOPPED);
      debug('Pool stopped');
    });
  }

  async acquire(requestId = shortId()) {
    if (this.#stopOperation.initiated) throw new Error('The pool has been stopped');
    if (!this.#startOperation.initiated) await this.start();

    return scope(`acquire[${requestId}]`, () => {
      const timeLimit = new TimeLimit('acquire resource', this.#config.acquireTimeout);
      const handler = (request) => this.#handleAcquire(request);
      const request = this.#createAcquireRequest(requestId, handler);
      this.#enqueue(request);
      timeLimit.onTimeout(() => this.#abortAcquire(request));
      return timeLimit.restrict(request.wait());
    });
  }

  async release(resource) {
    if (!this.#startOperation.initiated) throw new Error('The pool has not been started');

    return new ReleaseOperation().run(async () => {
      const bay = this.#repository.locate(resource);
      await bay.reset();
      bay.release();
    }).catch((error) => {
      debug('Error releasing resource', error);
    });
  }

  async destroy(resource) {
    if (!this.#startOperation.initiated) throw new Error('The pool has not been started');

    return new DestroyOperation().run(async () => {
      const bay = this.#repository.locate(resource);
      await bay.destroy();
    }).catch((error) => {
      debug('Error destroying resource', error);
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
    debug('Initialising %d resources', this.#repository.deficit);
    return PromiseUtils.times(this.#repository.deficit, () => {
      const handler = (request) => this.#handleInitialise(request);
      const request = this.#createAcquireRequest(shortId(), handler);
      this.#enqueue(request);
      timeLimit.onTimeout(() => request.abort());
      return request.wait();
    }, this.#config.maxConcurrency);
  }

  async #handleInitialise(request) {
    await scope(`initialise[${request.id}]`, async () => {
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
    } catch (error) {
      debug('Error acquiring resource', error);
      this.#requeue(request);
    }
  }

  #abortAcquire(request) {
    request.abort();
    this.emit(XPoolEvents.ACQUISITION_TIMEOUT, { timeout: this.#config.acquireTimeout, requestId: request.id });
  }

  #enqueue(request) {
    this.#queue.add(request);
    this.#checkQueue();
  }

  async #requeue(request) {
    await request.requeue();
    unscope(() => this.#checkQueue());
  }

  #dequeue(request, resource) {
    request.dequeue(resource);
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

  async #stopGracefully() {
    debug('Waiting for queue to drain');
    await this.#queue.drain();

    this.#replaceEventListeners();

    debug('Waiting for resources to be destroyed');
    await this.#repository.cull(this.#stopOperation);
    this.#checkStop();

    await this.#stopOperation.wait();
  }

  #checkStop() {
    if (!this.#repository.isDrained()) return;
    this.#stopOperation.finalise();
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

  #addEventListeners() {
    this.#eventListeners.add(XPoolEvents.RESOURCE_RELEASED, () => unscope(() => this.#checkQueue()));
    this.#eventListeners.add(XPoolEvents.RESOURCE_DESTROYED, () => unscope(() => this.#checkQueue()));
    this.#eventListeners.add(XPoolEvents.RESOURCE_DESTROYED, () => unscope(() => this.#checkReplenish()));
    this.#eventListeners.add(XPoolEvents.RESOURCE_ACQUIRED, () => unscope(() => this.#checkReplenish()));
    this.#eventListeners.forEach((event, listeners) => {
      listeners.forEach((listener) => this.on(event, listener));
    });
  }

  #replaceEventListeners() {
    this.#eventListeners.forEach((event, listeners) => {
      listeners.forEach((listener) => this.off(event, listener));
    });
    this.#eventListeners.clear();
    this.#eventListeners.add(XPoolEvents.RESOURCE_RELEASED, () => unscope(() => this.#repository.cull(this.#stopOperation)));
    this.#eventListeners.add(XPoolEvents.RESOURCE_DESTROYED, () => unscope(() => this.#checkStop()));
  }
}

module.exports = XPool;
