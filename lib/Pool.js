const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const debug = require('debug')('x-pool');
const { runInContext, getContextId } = require('./runInContext');
const TimedTask = require('./TimedTask');
const ResourceStore = require('./ResourceStore');
const { validateFactory, validateNumber } = require('./validation');
const { XPoolError, OperationTimedout, ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed } = require('./Errors');

const DEFAULT_ACQUIRE_RETRY_INTERVAL = 100;

module.exports = class Pool extends EventEmitter {

  constructor(options = {}) {
    super();
    this._factory = validateFactory(options.factory);
    this._acquireTimeout = validateNumber('acquireTimeout', options, true, 1);
    this._acquireRetryInterval = validateNumber('acquireRetryInterval', options, false, 0) || DEFAULT_ACQUIRE_RETRY_INTERVAL;
    this._destroyTimeout = validateNumber('destroyTimeout', options, true, 1);
    this._store = new ResourceStore({ maxSize: options.maxSize });
    this._acquireQueue = [];
  }

  async acquire() {
    return runInContext(async () => {
      const task = this._createAcquireTask();
      const resource = await task.execute();
      debug('[%d] Successfully acquired resource', getContextId());
      return resource;
    });
  }

  _createAcquireTask() {
    const fn = () => new Promise((resolve, reject) => {
      this._queueAcquire({ resolve, reject });
      this._checkAcquireQueue();
    }).then(() => this._acquireResource());

    const onLateResolve = (resource) => {
      debug('[%d] Storing resource', getContextId());
      this._store.addIdleResource(resource);
    };

    return new TimedTask('acquire', fn, this._acquireTimeout, onLateResolve);
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

  async _acquireResource() {
    debug('[%d] Acquiring resource', getContextId());
    let resource;
    while (!(resource = await this._obtainValidResource())) {
      debug('[%d] Retrying in %dms', getContextId(), this._acquireRetryInterval);
      await this._delay(this._acquireRetryInterval);
    }
    this._store.addAcquiredResource(resource);
    return resource;
  }

  async _obtainValidResource() {
    const resource = this._store.getIdleResource() || await this._createResource();
    return resource ? this._validateResource(resource) : resource;
  }

  async _createResource() {
    debug('[%d] Creating resource', getContextId());
    try {
      return await this._factory.create();
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
      const fn = async () => this._destroyResource(resource);
      const onLateResolve = () => {};
      const task = new TimedTask('destroy', fn, this._destroyTimeout, onLateResolve);
      await task.execute();
      this._store.removeAcquiredResource(resource);
      debug('[%d] Resource destroyed', getContextId());
      this._checkAcquireQueue();
    } catch (cause) {
      debug('[%d] Resource destruction failed: %s', getContextId(), cause.message);
      this._store.excludeBadResource(resource);
      const err = cause.code === OperationTimedout.code ? cause : new ResourceDestructionFailed('Error destroying resource', { cause });
      this._emit(err);
    }
  }

  async _destroyResource(resource) {
    await this._factory.destroy(resource);
  }

  _emit(err) {
    debug('[%d] Emitting %s', getContextId(), err.code);
    setImmediate(() => this.emit(err.code, err) || this.emit(XPoolError.code, err));
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
