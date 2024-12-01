const { EventEmitter } = require('node:events');
const debug = require('debug')('XPool:Repository');
const fwd = require('fwd');
const ResourceBay = require('./bay/ResourceBay');
const MissingBay = require('./bay/MissingBay');
const List = require('./utils/List');

class Repository extends EventEmitter {

  #maxSize;
  #commandFactory;
  #partitions;
  #stopRequest;

  constructor(maxSize, commandFactory) {
    super();
    this.#maxSize = maxSize;
    this.#commandFactory = commandFactory;
    this.#partitions = {
      empty: new List(),
      pending: new List(),
      ready: new List(),
      idle: new List(),
      acquired: new List(),
      doomed: new List(),
      segregated: new List(),
    };
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
    return (this.#partitions.idle.get() || this.extend()).reserve(request);
  }

  locate(resource) {
    return this.#partitions.acquired.find((bay) => bay.contains(resource)) || new MissingBay();
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
