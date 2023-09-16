const AcquisitionRequestQueue = require('./AcquisitionRequestQueue');
const ManagedResources = require('./ManagedResources');
const ShutdownRequest = require('./ShutdownRequest');
const XPoolError = require('./XPoolError');

module.exports = class Pool {

  static Events = {
    ERR_ACQUIRE_TIMEDOUT: Symbol('X-POOL_ERR_ACQUIRE_TIMEDOUT'),
    ERR_DESTROY_FAILED: Symbol('X-POOL_ERR_DESTROY_FAILED'),
    ERR_DESTROY_TIMEDOUT: Symbol('X-POOL_ERR_DESTROY_TIMEDOUT'),
    ERR_SHUTDOWN_REQUESTED: Symbol('X-POOL_ERR_SHUTDOWN_REQUESTED'),
    ERR_SHUTDOWN_FAILED: Symbol('X-POOL_ERR_SHUTDOWN_FAILED'),
    ERR_SHUTDOWN_TIMEDOUT: Symbol('X-POOL_ERR_SHUTDOWN_TIMEDOUT'),
  };

  #acquireTimeout;
  #acquireRetryInterval;
  #destroyTimeout;
  #shutdownTimeout;

  #managedResources;
  #acquisitionRequestQueue = new AcquisitionRequestQueue();
  #shutdownRequest;

  constructor({ factory, maxSize = Infinity, acquireTimeout, acquireRetryInterval = 100, destroyTimeout, shutdownTimeout }) {
    this.#acquireTimeout = acquireTimeout;
    this.#acquireRetryInterval = acquireRetryInterval;
    this.#destroyTimeout = destroyTimeout;
    this.#shutdownTimeout = shutdownTimeout;
    this.#managedResources = new ManagedResources({ factory, maxSize });
  }

  async acquire() {
    this.#errorIfShutdownRequested();
    const timeout = this.#prepareAcquireTimeout();
    const operation = this.#acquireOperation();
    return Promise.race([timeout, operation])
      .then((managedResource) => managedResource.acquire().resource);
  }

  #acquireOperation() {
    return this.#queueAcquisitionRequest()
      .then((request) => this.#doggedlyAcquireResource().finally(() => this.#dequeueAcquisitionRequest(request)));
  }

  #prepareAcquireTimeout() {
    const err = new XPoolError(Pool.Events.ERR_ACQUIRE_TIMEDOUT, `Acquire timedout after ${this.#acquireTimeout}ms`);
    return this.#prepareTimeout(err, this.#acquireTimeout);
  }

  #queueAcquisitionRequest() {
    return new Promise(((resolve, reject) => {
      this.#acquisitionRequestQueue.add(resolve, reject);
      this.#checkQueue();
    }));
  }

  #dequeueAcquisitionRequest(request) {
    this.#acquisitionRequestQueue.remove(request);
  }

  #checkQueue() {
    if (!this.#managedResources.hasIdleResources() && !this.#managedResources.hasSpareCapacity()) return;
    this.#acquisitionRequestQueue.next()?.resolve();
  }

  async #doggedlyAcquireResource() {
    let managedResource = null;
    while (!managedResource) {
      try {
        managedResource = await this.#useIdleResource() || await this.#createNewResource();
      } catch (err) {
        await this.#delayAcquisitionRetry();
      }
    }
    return managedResource;
  }

  async #useIdleResource() {
    const managedResource = this.#managedResources.getIdleManagedResource();
    await managedResource?.validate();
    return managedResource;
  }

  async #createNewResource() {
    const managedResource = this.#managedResources.add();
    await managedResource.create();
    await managedResource.validate();
    this.#managedResources.index(managedResource);
    return managedResource.idle();
  }

  #delayAcquisitionRetry() {
    return new Promise((resolve) => {
      setTimeout(resolve, this.#acquireRetryInterval);
    });
  }

  release(resource) {
    this.#managedResources.release(resource);
    this.#checkQueue();
    this.#checkShutdown();
  }

  async destroy(resource) {
    const timeout = this.#prepareDestroyTimeout();
    const operation = this.#destroyOperation(resource);
    return Promise.race([timeout, operation]);
  }

  #destroyOperation(resource) {
    return this.#managedResources.destroy(resource).then(() => {
      this.#checkQueue();
      this.#checkShutdown();
    }).catch((cause) => {
      this.#managedResources.quarantine(resource);
      throw new XPoolError(Pool.Events.ERR_DESTROY_FAILED, `Destroy failed: ${cause.message}`, { cause });
    });
  }

  #prepareDestroyTimeout() {
    const err = new XPoolError(Pool.Events.ERR_DESTROY_TIMEDOUT, `Destroy timedout after ${this.#destroyTimeout}ms`);
    return this.#prepareTimeout(err, this.#destroyTimeout);
  }

  evictQuarantinedResources() {
    this.#managedResources.evictQuarantinedResources();
    this.#checkQueue();
    this.#checkShutdown();
  }

  async shutdown() {
    if (this.#shutdownRequest) return this.#shutdownRequest.race;
    this.#shutdownRequest = new ShutdownRequest();
    const timeout = this.#prepareShutdownTimeout();
    const operation = new Promise((resolve, reject) => {
      this.#shutdownRequest.resolve = resolve;
      this.#shutdownRequest.reject = reject;
    });
    this.#shutdownRequest.race = Promise.race([timeout, operation]);
    this.#checkShutdown();
    return this.#shutdownRequest.race;
  }

  #prepareShutdownTimeout() {
    const err = new XPoolError(Pool.Events.ERR_SHUTDOWN_TIMEDOUT, `Shutdown timedout after ${this.#shutdownTimeout}ms`);
    return this.#prepareTimeout(err, this.#shutdownTimeout);
  }

  #errorIfShutdownRequested() {
    if (this.#shutdownRequest) throw new XPoolError(Pool.Events.ERR_SHUTDOWN_REQUESTED, 'Shutdown requested');
  }

  #checkShutdown() {
    if (!this.#shutdownRequest) return;
    if (this.#acquisitionRequestQueue.hasRequests()) return;
    if (this.#managedResources.hasAcquiredResources()) return;

    this.#managedResources.destroyIdleResources().then(() => {
      this.#managedResources.evictQuarantinedResources();
      this.#shutdownRequest.resolve();
    }).catch((cause) => {
      const err = new XPoolError(Pool.Events.ERR_SHUTDOWN_FAILED, `Shutdown failed: ${cause.message}`, { cause });
      this.#shutdownRequest.reject(err);
    });
  }

  stats() {
    return { ...this.#acquisitionRequestQueue.stats(), ...this.#managedResources.stats() };
  }

  #prepareTimeout(err, timeout) {
    return new Promise((_, reject) => setTimeout(() => reject(err), timeout).unref());
  }
};
