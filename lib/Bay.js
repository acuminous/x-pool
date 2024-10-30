const { EventEmitter } = require('node:events');
const debug = require('debug')('XPool:Bay');
const Events = require('./Events');
const AsyncLatch = require('./utils/AsyncLatch');

const BayStatus = {
  EMPTY: Symbol('empty'),
  RESERVED: Symbol('reserved'),
  CREATING: Symbol('creating'),
  IDLE: Symbol('idle'),
  BUSY: Symbol('busy'),
  DESTROYING: Symbol('destroying'),
  SEGREGATED: Symbol('segregated'),
};

class Bay extends EventEmitter {

  #id;
  #status = BayStatus.EMPTY;
  #request;
  #resource;
  #commands;
  #createLatch = new AsyncLatch();

  constructor(id, commands) {
    super();
    this.#id = id;
    this.#commands = commands;
  }

  get id() {
    return this.#id;
  }

  get #requestId() {
    return this.#request?.id ? this.#request.id : 'N/A'
  }

  isInitialising() {
    return [BayStatus.EMPTY, BayStatus.RESERVED, BayStatus.CREATING].includes(this.#status);
  }

  isReserved() {
    return this.#status === BayStatus.RESERVED;
  }

  isIdle() {
    return this.#status === BayStatus.IDLE
  }

  isBusy() {
    return this.#status === BayStatus.BUSY
  }

  isDestroying() {
    return this.#status === BayStatus.DESTROYING;
  }

  isSegregated() {
    return this.#status === BayStatus.SEGREGATED
  }

  contains(resource) {
    return this.#resource === resource;
  }

  reserve(request) {
    debug(`Reserving bay [${this.id}] for request [${this.#requestId}]`)
    this.#request = request;
    this.#status = BayStatus.RESERVED;
    return this;
  }

  async provision() {
    debug(`Provisioning resource to bay [${this.id}] for request [${this.#requestId}]`);
    await this.#createResource();
    this.#status = BayStatus.IDLE;
  }

  async acquire() {
    debug(`Acquiring resource from bay [${this.id}] for request [${this.#requestId}]`)
    if (!this.#resource) await this.#createResource();
    if (this.#request.isAborted()) throw new Error('Request aborted');
    this.#status = BayStatus.BUSY;
    return this.#resource;
  }

  async release() {
    debug(`Releasing resource from bay [${this.id}] for request [${this.#requestId}]`);
    this.#request = null;
    this.#status = BayStatus.IDLE;
    this.emit(Events.RESOURCE_RELEASED);
  }

  async destroy(onEventualSuccess) {
    debug(`Destroying bay [${this.id}] for request [${this.#requestId}]`);
    this.#status = BayStatus.DESTROYING;
    await this.#createLatch.block();
    await this.#destroyResource(onEventualSuccess);
  }

  segregate() {
    debug(`Segregating bay [${this.id}] for request [${this.#requestId}]`)
    this.#status = BayStatus.SEGREGATED;
    this.emit(Events.RESOURCE_SEGREGATED);
  }

  evict() {
    debug(`Evicting bay [${this.id}] for request [${this.#requestId}]`);
    this.emit(Events.RESOURCE_EVICTED);
  }

  async #createResource() {
    this.#status = BayStatus.CREATING;
    this.#createLatch.activate();

    const onEventualSuccess = (resource) => {
      debug(`Resource created in bay [${this.id}] for request [${this.#requestId}]`);
      this.#resource = resource;
      this.emit(Events.RESOURCE_CREATED);
      this.#createLatch.release();
    }

    const onEventualError = (err) => {
      this.emit(Events.RESOURCE_CREATION_ERROR, err)
      this.#createLatch.release();
    }

    await this.#commands.create.execute(onEventualSuccess, onEventualError);
  }

  async #destroyResource(onEventualSuccess) {
    if (!this.#resource) return onEventualSuccess();
    await this.#commands.destroy.execute(this.#resource, () => {
      debug(`Resource from bay [${this.id}] destroyed for request [${this.#requestId}]`);
      onEventualSuccess();
      this.emit(Events.RESOURCE_DESTROYED);
    });
  }
}

module.exports = Bay;
