const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const TimedTask = require('./TimedTask');
const { validateFactory, validateMilliseconds } = require('./validation');
const { XPoolError, ResourceCreationFailed, ResourceValidationFailed } = require('./Errors');

const DEFAULT_ACQUIRE_RETRY_INTERVAL = 100;

module.exports = class Pool extends EventEmitter {

  constructor(options = {}) {
    super();
    this._factory = validateFactory(options.factory);
    this._acquireTimeout = validateMilliseconds('acquireTimeout', options, true, 1);
    this._acquireRetryInterval = validateMilliseconds('acquireRetryInterval', options, false, 0) || DEFAULT_ACQUIRE_RETRY_INTERVAL;
    this._acquired = [];
    this._idle = [];
  }

  async acquire() {
    const fn = async () => {
      let resource;
      while (!resource) {
        const candidate = this._hasIdleResources() ? this._getResource() : await this._createResource();
        const isValid = await this._validateResource(candidate);
        if (isValid) resource = candidate;
        if (!resource) await scheduler.wait(this._acquireRetryInterval);
      }
      this._acquireResource(resource);
      return resource;
    };
    const onLateYield = (resource) => {
      this._idle.push(resource);
    };
    const task = new TimedTask('acquire', fn, this._acquireTimeout, onLateYield);
    return task.execute();
  }

  release(resource) {
    const index = this._acquired.indexOf(resource);
    if (index < 0) return;

    this._acquired.splice(index, 1);
    this._idle.push(resource);
  }

  stats() {
    return {
      size: this._acquired.length + this._idle.length,
      acquired: this._acquired.length,
      idle: this._idle.length,
      spare: Infinity,
      available: Infinity,
    };
  }

  async _createResource() {
    let resource;
    try {
      resource = await this._factory.create();
    } catch (cause) {
      const err = new ResourceCreationFailed('Error creating resource', { cause });
      this._emit(err);
    }
    return resource;
  }

  async _getResource() {
    return this._idle.shift();
  }

  async _validateResource(resource) {
    try {
      await this._factory.validate(resource);
      return true;
    } catch (cause) {
      const err = new ResourceValidationFailed('Error validating resource', { cause });
      this._emit(err);
      return false;
    }
  }

  async _acquireResource(resource) {
    this._acquired.push(resource);
  }

  _hasIdleResources() {
    return this._idle.length > 0;
  }

  _emit(err) {
    this.emit(err.code, err) || this.emit(XPoolError.code, err);
  }
};
