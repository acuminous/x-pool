const { EventEmitter } = require('node:events');
const debug = require('debug')('XPool:Repository');
const fwd = require('fwd');
const ResourceBay = require('./bay/ResourceBay');
const NullBay = require('./bay/NullBay');
const Partition = require('./Partition');

class Repository extends EventEmitter {

  #maxSize;
  #commandFactory;
  #stopRequest;
  #partitions = {
    empty: new Partition('empty'),
    pending: new Partition('pending'),
    ready: new Partition('ready'),
    idle: new Partition('idle'),
    acquired: new Partition('acquired'),
    doomed: new Partition('doomed'),
    segregated: new Partition('segregated'),
  };

  constructor(maxSize, commandFactory) {
    super();
    this.#maxSize = maxSize;
    this.#commandFactory = commandFactory;
  }

  forwardEvents(target) {
    fwd(this, target);
  }

  get size() {
    return Object.values(this.#partitions).reduce((size, partition) => size + partition.size, 0);
  }

  hasCapacity() {
    return this.hasIdleResources() || this.canExtend();
  }

  hasIdleResources() {
    return this.#partitions.idle.size > 0;
  }

  canExtend() {
    return this.size < this.#maxSize;
  }

  isDrained() {
    return this.size === this.#partitions.segregated.size;
  }

  stats() {
    const { empty, pending, ready, idle, acquired, doomed, segregated } = this.#partitions;
    return {
      size: this.size,
      initialising: empty.size + pending.size + ready.size,
      idle: idle.size,
      acquired: acquired.size,
      doomed: doomed.size,
      segregated: segregated.size
    };
  }

  extend() {
    const bay = new ResourceBay(this.#partitions, this.#commandFactory)
    bay.forwardEvents(this);
    return bay;
  }

  reserve(request) {
    return (this.#partitions.idle.peak() || this.extend()).reserve(request);
  }

  locate(resource) {
    return this.#partitions.acquired.find((bay) => bay.contains(resource)) || new NullBay();
  }

  async stop(stopRequest) {
    this.#stopRequest = stopRequest;
    await this.cull();
  }

  async cull() {
    await this.#cullIdleResource();
    if (this.isDrained()) this.#stopRequest.finalise();
  }

  async #cullIdleResource() {
    if (!this.hasIdleResources()) return;
    debug(`Culling ${this.#partitions.idle.size.toLocaleString()} idle resources`);
    const destroyIdleResources = this.#partitions.idle.map((bay) => bay.reserve(this.#stopRequest).destroy().catch(() => {}));
    await Promise.all(destroyIdleResources);
  }
}

module.exports = Repository;
