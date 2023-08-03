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
      const resource = await this._acquireResource();
      this._trackAcquiredResource(resource);
      return resource;
    };
    const onLateYield = (resource) => {
      this._trackIdleResource(resource);
    };
    const task = new TimedTask('acquire', fn, this._acquireTimeout, onLateYield);
    return task.execute();
  }

  async _acquireResource() {
    let resource;
    while (!(resource = await this._obtainValidResource())) {
      await this._delay(this._acquireRetryInterval);
    }
    return resource;
  }

  async _obtainValidResource() {
		const resource = this._hasIdleResources() ? this._getIdleResource() : await this._createResource();
		return resource ? this._validateResource(resource) : undefined;
  }

  release(resource) {
  	if (!this._releaseResource(resource)) return;
  	this._trackIdleResource(resource);
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

  _hasIdleResources() {
    return this._idle.length > 0;
  }

  _getIdleResource() {
    return this._idle.shift();
  }

	_trackIdleResource(resource) {
    this._idle.push(resource);
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

  async _validateResource(resource) {
    try {
      await this._factory.validate(resource);
      return resource;
    } catch (cause) {
      const err = new ResourceValidationFailed('Error validating resource', { cause });
      this._emit(err);
    }
  }

  _releaseResource(resource) {
    const index = this._acquired.indexOf(resource);
    if (index < 0) return false;
    this._acquired.splice(index, 1);
    return true;
  }

  async _trackAcquiredResource(resource) {
    this._acquired.push(resource);
  }

  _emit(err) {
    this.emit(err.code, err) || this.emit(XPoolError.code, err);
  }

	_delay(millis) {
		return scheduler.wait(millis);
	}
};
