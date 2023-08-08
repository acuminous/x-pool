const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const debug = require('debug')('x-pool');
const { runInContext, getContextId } = require('./context');
const TimedTask = require('./TimedTask');
const ResourceStore = require('./ResourceStore');
const { validateFactory, validateNumber } = require('./validation');
const { XPoolError, ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed } = require('./Errors');

const DEFAULT_ACQUIRE_RETRY_INTERVAL = 100;

module.exports = class Pool extends EventEmitter {

  constructor(options = {}) {
    super();
    this._factory = validateFactory(options.factory);
    this._acquireTimeout = validateNumber('acquireTimeout', options, true, 1);
    this._acquireRetryInterval = validateNumber('acquireRetryInterval', options, false, 0) || DEFAULT_ACQUIRE_RETRY_INTERVAL;
    this._destroyTimeout = validateNumber('destroyTimeout', options, true, 1);
    this._initialiseTimeout = validateNumber('initialiseTimeout', options, false, 1);
    this._store = new ResourceStore({ maxSize: options.maxSize, minSize: options.minSize });
    this._acquireQueue = [];
  }

  async initialise() {
    return runInContext(async () => {
      debug('[%d] Initialising pool', getContextId());
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

  _createInitialiseTask() {
    const fn = async (task) => this._batchAquire(task);
    return new TimedTask({ name: 'initialise', fn, timeout: this._initialiseTimeout });
  }

  async _batchAquire(task) {
    const acquireResources = this._store.getEmptyBatch().map(async () => {
      let resource;
      while (!resource && !task.isAborted()) {
        resource = await this._safeAcquire();
      }
      return resource;
    });
    return Promise.all(acquireResources);
  }

  async _safeAcquire() {
    try {
      return await this.acquire();
    } catch {
      // ignore
    }
  }

  async acquire() {
    return runInContext(async () => {
      debug('[%d] Acquiring resource', getContextId());
      const task = this._createAcquireTask();
      const resource = await task.execute();
      debug('[%d] Successfully acquired resource', getContextId());
      return resource;
    });
  }

  _createAcquireTask() {
    const fn = (task) => new Promise((resolve, reject) => {
      this._queueAcquire({ resolve, reject });
      this._checkAcquireQueue();
    }).then(() => this._acquireResource(task));

    const onLateResolve = (resource) => {
      debug('[%d] Storing resource', getContextId());
      this._store.addIdleResource(resource);
    };

    return new TimedTask({ name: 'acquire', fn, timeout: this._acquireTimeout, onLateResolve });
  }

  _queueAcquire(entry) {
    debug('[%d] Queueing acquire', getContextId());
    this._acquireQueue.push(entry);
  }

  _checkAcquireQueue() {
    debug('[%d] Checking acquire queue', getContextId());
    if (this._acquireQueue.length === 0) return debug('[%d] Acquire queue is empty', getContextId());
    if (this._store.isExhausted()) return debug('[%d] Pool is exhausted', getContextId());
    const { resolve } = this._acquireQueue.shift();
    resolve();
  }

  release(resource) {
    return runInContext(() => {
      debug('[%d] Releasing resource', getContextId());
      this._store.releaseAcquiredResource(resource);
      this._checkAcquireQueue();
    });
  }

  destroy(resource) {
    return runInContext(() => {
      debug('[%d] Destroying resource', getContextId());
      this._backgroundDestroy(resource);
    });
  }

  evictBadResources() {
    return runInContext(() => {
      debug('[%d] Evicting bad resources', getContextId());
      this._store.evictBadResources();
    });
  }

  stats() {
    return this._store.stats();
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
    if (!task.isAborted()) this._store.addAcquiredResource(resource);
    return resource;
  }

  async _obtainValidResource() {
    const resource = this._store.getIdleResource() || await this._createResource();
    return resource ? this._validateResource(resource) : resource;
  }

  async _createResource() {
    debug('[%d] Creating resource', getContextId());
    try {
      return await this._factory.create(this);
    } catch (cause) {
      debug('[%d] Resource creation failed: %s', getContextId(), cause.message);
      const err = new ResourceCreationFailed('Error creating resource', { cause });
      this._emit(err);
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
      this._emit(err);
    }
  }

  async _backgroundDestroy(resource) {
    try {
      const task = this._createDestroyTask(resource);
      await task.execute();
      this._store.removeAcquiredResource(resource);
      debug('[%d] Resource destroyed', getContextId());
      this._checkAcquireQueue();
    } catch (err) {
      debug('[%d] Resource destruction failed: %s', getContextId(), err.message);
      this._store.excludeBadResource(resource);
      this._emit(err);
    }
  }

  _createDestroyTask(resource) {
    const fn = async () => {
      try {
        await this._factory.destroy(resource);
      } catch (cause) {
        throw new ResourceDestructionFailed('Error destroying resource', { cause });
      }
    };
    return new TimedTask({ name: 'destroy', fn, timeout: this._destroyTimeout });
  }

  _emit(err) {
    debug('[%d] Emitting %s', getContextId(), err.code);
    setImmediate(() => this.emit(err.code, err) || this.emit(XPoolError.code, err));
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
