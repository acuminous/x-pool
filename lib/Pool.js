const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const debug = require('debug')('x-pool');
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
    const fn = () => new Promise((resolve, reject) => {
      this._queueAcquire({ resolve, reject });
      this._checkAcquireQueue();
    }).then(() => this._acquireResource());
    const onLateResolve = (resource) => this._store.addIdleResource(resource);
    const task = new TimedTask('acquire', fn, this._acquireTimeout, onLateResolve);
    const resource = await task.execute();
    debug('Returning resource');
    return resource;
  }

  _queueAcquire(entry) {
    debug('Queueing acquire');
    this._acquireQueue.push(entry);
  }

  _checkAcquireQueue() {
    debug('Checking acquire queue');
    if (this._acquireQueue.length === 0) return debug('Acquire queue is empty');
    if (this._store.isExhausted()) return debug('Pool is exhaused');
    const { resolve } = this._acquireQueue.shift();
    resolve();
  }

  release(resource) {
    debug('Releasing resource');
    this._store.releaseAcquiredResource(resource);
    this._checkAcquireQueue();
  }

  destroy(resource) {
    debug('Destroying resource');
    this._backgroundDestroy(resource);
  }

  stats() {
    return this._store.stats();
  }

  async _acquireResource() {
    debug('Acquiring resource');
    let resource;
    while (!(resource = await this._obtainValidResource())) {
      debug(`Failed to obtain a valid resource. Retrying in ${this._acquireRetryInterval}ms`);
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
    debug('Creating resource');
    try {
      return await this._factory.create();
    } catch (cause) {
      debug(`Resource creation failed: ${cause.message}`);
      const err = new ResourceCreationFailed('Error creating resource', { cause });
      this._emit(err);
    }
  }

  async _validateResource(resource) {
    debug('Validating resource');
    try {
      await this._factory.validate(resource);
      return resource;
    } catch (cause) {
      debug(`Resource validation failed: ${cause.message}`);
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
      this._checkAcquireQueue();
    } catch (cause) {
      this._store.excludeBadResource(resource);
      const err = cause.code === OperationTimedout.code ? cause : new ResourceDestructionFailed('Error destroying resource', { cause });
      this._emit(err);
    }
  }

  async _destroyResource(resource) {
    await this._factory.destroy(resource);
  }

  _emit(err) {
    this.emit(err.code, err) || this.emit(XPoolError.code, err);
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
