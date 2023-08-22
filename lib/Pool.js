const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const debug = require('debug')('x-pool');
const { runInContext, getContextId } = require('./context');
const TimedTask = require('./TimedTask');
const State = require('./State');
const { validateFactory, validateNumber } = require('./validation');
const { XPoolError, ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed, OperationFailed } = require('./Errors');

const DEFAULT_ACQUIRE_RETRY_INTERVAL = 100;

module.exports = class Pool extends EventEmitter {

  constructor(options = {}) {
    super();
    this._factory = validateFactory(options.factory);
    this._acquireTimeout = validateNumber('acquireTimeout', options, true, 1);
    this._acquireRetryInterval = validateNumber('acquireRetryInterval', options, false, 0) || DEFAULT_ACQUIRE_RETRY_INTERVAL;
    this._destroyTimeout = validateNumber('destroyTimeout', options, true, 1);
    this._initialiseTimeout = validateNumber('initialiseTimeout', options, false, 1);
    this._shutdownTimeout = validateNumber('shutdownTimeout', options, false, 1);
    this._state = new State({ maxSize: options.maxSize, minSize: options.minSize });
  }

  async initialise() {
    this._assertRunning();
    return runInContext(async () => {
      debug('[%d] Initialising', getContextId());
      let resources;
      if (this._initialiseTimeout) {
        const task = this._createInitialiseTask();
        resources = await task.execute();
      } else {
        const task = { isAborted: () => false };
        resources = await this._batchAquire(task);
      }
      resources.forEach((resource) => this.release(resource));
    });
  }

  async with(fn) {
    let resource;
    try {
      resource = await this.acquire();
      return fn(resource);
    } finally {
      this.release(resource);
    }
  }

  async acquire() {
    this._assertRunning();
    return runInContext(async () => {
      debug('[%d] Acquiring resource', getContextId());
      const task = this._createAcquireTask();
      const resource = await task.execute();
      debug('[%d] Successfully acquired resource', getContextId());
      return resource;
    });
  }

  release(resource) {
    return runInContext(() => {
      debug('[%d] Releasing resource', getContextId());
      this._state.releaseAcquiredResource(resource);
      this._checkAcquireQueue();
      this._checkShutdown();
    });
  }

  destroy(resource) {
    return runInContext(async () => {
      debug('[%d] Destroying resource', getContextId());
      await this._backgroundDestroy(resource);
      this._state.removeAcquiredResource(resource);
      this._checkAcquireQueue();
    });
  }

  evictBadResources() {
    return runInContext(() => {
      debug('[%d] Evicting %d bad resources', getContextId(), this._state.bad);
      this._state.evictBadResources();
    });
  }

  stats() {
    return this._state.stats();
  }

  async shutdown() {
    this._assertRunning();
    return runInContext(async () => {
      debug('[%d] Shutting down', getContextId());
      const task = this._createShutdownTask();
      return task.execute();
    });
  }

  _createShutdownTask() {
    const fn = async () => {
      const stopped = this._commenceShutdown();
      await this._checkShutdown();
      return stopped;
    };
    return new TimedTask({ name: 'shutdown', fn, timeout: this._destroyTimeout });
  }

  _commenceShutdown() {
    return new Promise((resolve, reject) => {
      this._stopping = { resolve, reject };
    });
  }

  _completeShutdown() {
    this._stopping.resolve();
  }

  _assertRunning() {
    if (this._stopping) throw new OperationFailed('The pool has been shutdown');
  }

  async _checkShutdown() {
    if (!this._stopping) return;
    debug('[%d] Running shutdown cycle', getContextId());
    this.evictBadResources();
    this._destroySpareResources();
    if (this._state.isEmpty()) this._completeShutdown();
  }

  async _destroySpareResources() {
    debug('[%d] Destroying %d spare resources', getContextId(), this._state.spare);
    const destroyResources = new Array(this._state.spare).fill().map(async () => {
      const resource = this._state.getIdleResource();
      try {
        await this._factory.destroy(resource);
      } catch (cause) {
        const err = new ResourceDestructionFailed('Error destroying resource', { cause });
        this._emitError(err);
      }
    });
    await Promise.all(destroyResources);
  }

  _createAcquireTask() {
    const fn = (task) => new Promise((resolve, reject) => {
      this._queueAcquireRequest({ resolve, reject });
      this._checkAcquireQueue();
    })
      .then(() => this._acquireResource(task));

    const onLateResolve = (resource) => {
      debug('[%d] Storing resource', getContextId());
      this._state.addIdleResource(resource);
    };

    return new TimedTask({ name: 'acquire', fn, timeout: this._acquireTimeout, onLateResolve });
  }

  _queueAcquireRequest(request) {
    debug('[%d] Queueing acquire', getContextId());
    this._state.queueAcquireRequest(request);
  }

  _checkAcquireQueue() {
    debug('[%d] Checking acquire queue', getContextId());
    if (!this._state.hasAcquireRequests()) return debug('[%d] Acquire queue is empty', getContextId());
    if (this._state.isExhausted()) return debug('[%d] Pool is exhausted', getContextId());
    const { resolve } = this._state.dequeueAcquireRequest();
    resolve();
  }

  _createInitialiseTask() {
    const fn = async (task) => this._batchAquire(task);
    return new TimedTask({ name: 'initialise', fn, timeout: this._initialiseTimeout });
  }

  async _batchAquire(task) {
    const batchSize = Math.max(this._state.minSize - this._state.size, 0);
    debug('[%d] Acquiring batch of %d resources', getContextId(), batchSize);
    const acquireResources = new Array(batchSize).fill().map(async () => {
      let resource;
      while (!resource && !task.isAborted()) {
        try {
          resource = await this.acquire();
        } catch {
          // Error events already emitted
        }
      }
      return resource;
    });
    return Promise.all(acquireResources);
  }

  async _acquireResource(task) {
    let resource;
    while (!resource && !task.isAborted()) {
      resource = await this._obtainValidResource();
      if (!resource) {
        debug('[%d] Retrying in %dms', getContextId(), this._acquireRetryInterval);
        await this._delay(this._acquireRetryInterval);
      }
    }
    if (!task.isAborted()) this._state.addAcquiredResource(resource);
    return resource;
  }

  async _obtainValidResource() {
    const resource = this._state.getIdleResource() || await this._createResource();
    return resource ? this._validateResource(resource) : resource;
  }

  async _createResource() {
    debug('[%d] Creating resource', getContextId());
    try {
      return await this._factory.create(this);
    } catch (cause) {
      debug('[%d] Resource creation failed: %s', getContextId(), cause.message);
      const err = new ResourceCreationFailed('Error creating resource', { cause });
      this._emitError(err);
    }
  }

  async _validateResource(resource) {
    debug('[%d] Validating resource', getContextId());
    try {
      await this._factory.validate(resource);
      return resource;
    } catch (cause) {
      debug('[%d] Resource validation failed: %s', getContextId(), cause.message);
      const err = new ResourceValidationFailed('Error validating resource', { cause });
      this._emitError(err);
      this._backgroundDestroy(resource);
    }
  }

  async _backgroundDestroy(resource) {
    try {
      const task = this._createDestroyTask(resource);
      await task.execute();
      debug('[%d] Resource destroyed', getContextId());
    } catch (err) {
      debug('[%d] Resource destruction failed: %s', getContextId(), err.message);
      this._state.excludeBadResource(resource);
      this._emitError(err);
    }
  }

  _createDestroyTask(resource) {
    const fn = async () => {
      try {
        await this._factory.destroy(resource);
        this._emitEvent({ code: 'EVT_X-POOL_RESOURCE_DESTROYED' });
      } catch (cause) {
        throw new ResourceDestructionFailed('Error destroying resource', { cause });
      }
    };
    const onLateResolve = () => {
      debug('[%d] Discarding resource', getContextId());
      this._state.evictBadResource(resource);
    };
    return new TimedTask({ name: 'destroy', fn, timeout: this._destroyTimeout, onLateResolve });
  }

  _emitEvent(event) {
    debug('[%d] Emitting event %s', getContextId(), event.code);
    setImmediate(() => this.emit(event.code, event) || this.emit('EVT_X-POOL_Event', event));
  }

  _emitError(err) {
    debug('[%d] Emitting error %s', getContextId(), err.code);
    setImmediate(() => this.emit(err.code, err) || this.emit(XPoolError.code, err));
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
