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
  #stopLatch;

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

  get size() {
    return Object.values(this.#partitions).reduce((size, partition) => size + partition.size, 0);
  }

  hasCapacity() {
    return this.#partitions.idle.size > 0 || this.size < this.#maxSize;
  }

  forwardEvents(target) {
    fwd(this, target);
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

  async release(bay) {
    bay.release();
    this.#cull();
  }

  async destroy(bay) {
    this.#cull();
  }

  async stop(stopLatch) {
    this.#stopLatch = stopLatch;
    await this.#cull();
    await this.#stopLatch.block();
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

  async #cull() {
    if (!this.#stopLatch?.isActive()) return;
    await this.#cullIdleResources();
    if (this.size === this.#partitions.segregated.size) this.#stopLatch.release();
  }

  async #cullIdleResources() {
    if (this.#partitions.idle.size === 0) return;
    debug(`Culling ${this.#partitions.idle.size.toLocaleString()} idle resources`);
    const destroyIdleResources = this.#partitions.idle.map((bay) => bay.reserve({ id: 'cull', associate: () => {} }).destroy().catch(() => {}));
    await Promise.all(destroyIdleResources);
  }
}

module.exports = Repository;
