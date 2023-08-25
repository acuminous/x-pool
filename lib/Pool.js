const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const debug = require('debug')('x-pool');
const { getContextId } = require('./context');
const TimedTask = require('./TimedTask');
const State = require('./State');
const { validateFactory, validateNumber } = require('./validation');
const { XPoolError, ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed, OperationFailed } = require('./Errors');
const { XPoolOperation, InitialisePoolOperation, AcquireResourceOperation, CreateResourceOperation, ValidateResourceOperation, ReleaseResourceOperation, WithResourceOperation, DestroyResourceOperation, EvictBadResourcesOperation, ShutdownPoolOperation, DestroySpareResourcesOperation } = require('./Operations');

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
    this._state = new State({ maxSize: options.maxSize, minSize: options.minSize, maxQueueDepth: options.maxQueueDepth });
  }

  async initialise() {
    this._assertRunning();
    const initialSize = this._getInitialSize();
    return new InitialisePoolOperation(this, { initialSize }).run(async () => {
      const resources = this._initialiseTimeout ? await this._initialiseWithTimeout() : await this._initialiseWithoutTimeout();
      await Promise.all(resources.map((resource) => this.release(resource)));
    });
  }

  async _initialiseWithTimeout() {
    const task = this._createInitialiseTask();
    return task.execute();
  }

  async _initialiseWithoutTimeout() {
    const task = { isAborted: () => false };
    return this._batchAquire(task);
  }

  async acquire() {
    this._assertRunning();
    return new AcquireResourceOperation(this).run((op) => {
      const task = this._createAcquireTask(op);
      return task.execute();
    });
  }

  release(resource) {
    // Do not await - can run in background
    new ReleaseResourceOperation(this).run(() => {
      this._state.releaseAcquiredResource(resource);
    }).then(() => {
      new XPoolOperation(this).run((op) => {
        this._checkAcquireQueue(op);
        this._checkShutdown();
      });
    });
  }

  async with(fn) {
    return new WithResourceOperation(this).run(async () => {
      let resource;
      try {
        resource = await this.acquire();
        return fn(resource);
      } finally {
        this.release(resource);
      }
    });
  }

  async destroy(resource) {
    // Do not await - can run in background
    new DestroyResourceOperation(this).run(async () => {
      await this._destroyResource(resource);
      this._state.removeAcquiredResource(resource);
    }).then(() => {
      new XPoolOperation(this).run((op) => {
        this._checkAcquireQueue(op);
      });
    });
  }

  evictBadResources() {
    const { bad } = this.stats();
    return new EvictBadResourcesOperation(this, { bad }).run(() => {
      this._state.evictBadResources();
    });
  }

  stats() {
    return this._state.stats();
  }

  async shutdown() {
    this._assertRunning();
    return new ShutdownPoolOperation(this).run(() => {
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

  async _checkShutdown() {
    if (!this._stopping) return;
    await this._destroySpareResources();
    this.evictBadResources();
    if (this._state.isEmpty()) this._completeShutdown();
  }

  _completeShutdown() {
    this._stopping.resolve();
  }

  _assertRunning() {
    if (this._stopping) throw new OperationFailed('The pool has been shutdown');
  }

  async _destroySpareResources() {
    const { spare } = this._state;
    return new DestroySpareResourcesOperation(this, { spare }).run((async () => {
      const destroyResources = new Array(spare).fill().map(async () => {
        const resource = this._state.getIdleResource();
        return this._destroyResource(resource);
      });
      await Promise.all(destroyResources);
    }));
  }

  _createAcquireTask(op) {
    const fn = (task) => new Promise((resolve, reject) => {
      this._queueAcquireRequest({ resolve, reject });
      this._checkAcquireQueue(op);
    }).then(() => this._acquireResource(op, task));

    const onLateResolve = (resource) => {
      op.notice('Storing resource');
      this._state.addIdleResource(resource);
    };

    return new TimedTask({ name: 'acquire', fn, timeout: this._acquireTimeout, onLateResolve });
  }

  _queueAcquireRequest(request) {
    this._state.queueAcquireRequest(request);
  }

  _checkAcquireQueue(op) {
    op.notice('Checking acquire queue');
    if (!this._state.hasAcquireRequests()) return op.notice('Acquire queue is empty');
    if (this._state.isExhausted()) return op.notice('Pool is exhausted');
    const { resolve } = this._state.dequeueAcquireRequest();
    resolve();
  }

  _createInitialiseTask() {
    const fn = async (task) => this._batchAquire(task);
    return new TimedTask({ name: 'initialise', fn, timeout: this._initialiseTimeout });
  }

  async _batchAquire(task) {
    const batchSize = this._getInitialSize();
    const acquireResources = new Array(batchSize).fill().map(async () => {
      let resource;
      while (!resource && !task.isAborted()) {
        try {
          resource = await this.acquire();
        } catch (err) {
          // Error events already emitted
        }
      }
      return resource;
    });
    return Promise.all(acquireResources);
  }

  _getInitialSize() {
    return Math.max(this._state.minSize - this._state.size, 0);
  }

  async _acquireResource(op, task) {
    let resource;
    while (!resource && !task.isAborted()) {
      resource = await this._obtainValidResource();
      if (!resource) {
        op.notice(`Retrying in ${this._acquireRetryInterval}ms`);
        await this._delay(this._acquireRetryInterval);
      }
    }
    if (!task.isAborted()) this._state.addAcquiredResource(resource);
    return resource;
  }

  async _obtainValidResource() {
    const resource = this._state.hasIdleResources() ? this._borrowResource() : await this._createResource();
    return this._validateResource(resource).then((isValid) => {
      if (isValid) return resource;
    });
  }

  _borrowResource() {
    return this._state.getIdleResource();
  }

  async _createResource() {
    return new CreateResourceOperation(this).run((op) => this._factory.create(this).catch((cause) => {
      const err = new ResourceCreationFailed('Error creating resource', { cause });
      op.error(err).end();
      this._emitError(err);
    }));
  }

  async _validateResource(resource) {
    if (resource === undefined) return;
    return new ValidateResourceOperation(this).run(async (op) => {
      try {
        await this._factory.validate(resource);
        return true;
      } catch (cause) {
        const err = new ResourceValidationFailed('Error validating resource', { cause });
        this._emitError(err);
        op.error(err).end();
        this._destroyResource(resource);
      }
    });
  }

  async _destroyResource(resource) {
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
    setImmediate(() => this.emit(event.code, event) || this.emit('EVT_X-POOL_Event', event));
  }

  _emitError(err) {
    setImmediate(() => this.emit(err.code, err) || this.emit(XPoolError.code, err));
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
