const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const TimedTask = require('./TimedTask');
const ResourceStore = require('./ResourceStore');
const { validateFactory, validateMilliseconds } = require('./validation');
const { XPoolError, OperationTimedout, ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed } = require('./Errors');

const DEFAULT_ACQUIRE_RETRY_INTERVAL = 100;

module.exports = class Pool extends EventEmitter {

  constructor(options = {}) {
    super();
    this._factory = validateFactory(options.factory);
    this._acquireTimeout = validateMilliseconds('acquireTimeout', options, true, 1);
    this._acquireRetryInterval = validateMilliseconds('acquireRetryInterval', options, false, 0) || DEFAULT_ACQUIRE_RETRY_INTERVAL;
    this._destroyTimeout = validateMilliseconds('destroyTimeout', options, true, 1);
    this._store = new ResourceStore();
  }

  async acquire() {
    const fn = async () => this._acquireResource();
    const onLateResolve = (resource) => this._store.addIdleResource(resource);
    const task = new TimedTask('acquire', fn, this._acquireTimeout, onLateResolve);
    return task.execute();
  }

  release(resource) {
    this._store.releaseAcquiredResource(resource);
  }

  destroy(resource) {
    this._store.removeAcquiredResource(resource);
    this._backgroundDestroy(resource);
  }

  stats() {
    return this._store.stats();
  }

  async _acquireResource() {
    let resource;
    while (!(resource = await this._obtainValidResource())) {
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
    try {
      return await this._factory.create();
    } catch (cause) {
      const err = new ResourceCreationFailed('Error creating resource', { cause });
      this._emit(err);
    }
  }

  async _validateResource(resource) {
    try {
      await this._factory.validate(resource);
      return resource;
    } catch (cause) {
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
    } catch (cause) {
      const err = cause.code === OperationTimedout.code ? cause : new ResourceDestructionFailed('Error destroying resource', { cause });
      this._emit(err);
    }
  }

  async _destroyResource(resource) {
    try {
      await this._factory.destroy(resource);
    } catch (cause) {
      const err = new ResourceDestructionFailed('Error destroying resource', { cause });
      this._emit(err);
    }
  }

  _emit(err) {
    this.emit(err.code, err) || this.emit(XPoolError.code, err);
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
