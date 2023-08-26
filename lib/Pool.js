const { EventEmitter } = require('node:events');
const { scheduler } = require('node:timers/promises');
const TimedTask = require('./TimedTask');
const State = require('./State');
const { validateFactory, validateNumber } = require('./validation');
const { ResourceCreationFailed, ResourceValidationFailed, ResourceDestructionFailed, PoolNotRunning } = require('./Errors');
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
    const initialSize = this._state.deficit;
    return new InitialisePoolOperation(this, { initialSize }).run(async () => {
      const resources = this._initialiseTimeout ? await this._initialiseWithTimeout(initialSize) : await this._initialiseWithoutTimeout(initialSize);
      await Promise.all(resources.map((resource) => this.release(resource)));
    });
  }

  async _initialiseWithTimeout(size) {
    const task = this._createInitialiseTask(size);
    return task.execute();
  }

  async _initialiseWithoutTimeout(size) {
    const task = { isAborted: () => false };
    return this._batchAquire(task, size);
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
    new DestroyResourceOperation(this).run(async (op) => {
      await this._destroyResource(op, resource);
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

  _assertRunning() {
    if (this._stopping) throw new PoolNotRunning('The pool has been shutdown');
  }

  _createInitialiseTask(size) {
    const fn = async (task) => this._batchAquire(task, size);
    return new TimedTask({ name: 'initialise', fn, timeout: this._initialiseTimeout });
  }

  async _batchAquire(task, size) {
    const acquireResources = new Array(size).fill().map(async () => {
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

  _createAcquireTask(op) {
    const fn = (task) => new Promise((resolve, reject) => {
      this._queueAcquireRequest({ resolve, reject });
      this._checkAcquireQueue(op);
    }).then(() => this._acquireResource(op, task));

    const onLateResolve = (resource) => {
      op.notice('Storing resource after timeout');
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
    if (resource !== undefined) {
      return this._validateResource(resource).catch(() => {
        new DestroyResourceOperation(this).run(async (op) => {
          await this._destroyResource(op, resource);
        });
      });
    }
  }

  _borrowResource() {
    return this._state.getIdleResource();
  }

  async _createResource() {
    return new CreateResourceOperation(this).run((op) => this._factory.create(this).catch((cause) => {
      const err = new ResourceCreationFailed(`Error creating resource: ${cause.message}`, { cause });
      op.failed(err).end();
    }));
  }

  async _validateResource(resource) {
    return new ValidateResourceOperation(this).run(async (op) => {
      try {
        await this._factory.validate(resource);
        return resource;
      } catch (cause) {
        const err = new ResourceValidationFailed(`Error validating resource: ${cause.message}`, { cause });
        op.failed(err).end();
        throw err;
      }
    });
  }

  async _destroyResource(op, resource) {
    try {
      const task = this._createDestroyTask(op, resource);
      await task.execute();
    } catch (err) {
      this._state.excludeBadResource(resource);
      op.failed(err).end();
    }
  }

  _createDestroyTask(op, resource) {
    const fn = async () => {
      try {
        await this._factory.destroy(resource);
      } catch (cause) {
        throw new ResourceDestructionFailed(`Error destroying resource: ${cause.message}`, { cause });
      }
    };
    const onLateResolve = () => {
      op.notice('Discarding resource after timeout');
      this._state.evictBadResource(resource);
    };
    return new TimedTask({ name: 'Destroy', fn, timeout: this._destroyTimeout, onLateResolve });
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

  async _destroySpareResources() {
    const { spare } = this._state;
    return new DestroySpareResourcesOperation(this, { spare }).run((async () => {
      const destroyResources = new Array(spare).fill().map(async () => new DestroyResourceOperation(this).run(async (op) => {
        const resource = this._state.getIdleResource();
        return this._destroyResource(op, resource);
      }));
      await Promise.all(destroyResources);
    }));
  }

  _delay(millis) {
    return scheduler.wait(millis);
  }
};
