const { EventEmitter } = require('node:events');
const debug = require('debug')('XPool:Dormitory');
const forwardEvents = require('fwd');
const Bay = require('./bay/Bay');
const List = require('./utils/List');

class Dormitory extends EventEmitter {

  #maxSize;
  #commandFactory;
  #wards;
  #stopLatch;

  constructor(maxSize, commandFactory) {
    super();
    this.#maxSize = maxSize;
    this.#commandFactory = commandFactory;
    this.#wards = {
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
    return Object.values(this.#wards).reduce((size, ward) => size + ward.size, 0);
  }

  hasCapacity() {
    return this.#wards.idle.size > 0 || this.size < this.#maxSize;
  }

  extend() {
    const bay = new Bay(this.#wards, this.#commandFactory)
    forwardEvents(bay, this);
    return bay;
  }

  reserve(request) {
    return (this.#wards.idle.get() || this.extend()).reserve(request);
  }

  locate(resource) {
    return this.#wards.acquired.find((bay) => bay.contains(resource));
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
    const { empty, pending, ready, idle, acquired, doomed, segregated } = this.#wards;
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
    if (this.size === this.#wards.segregated.size) this.#stopLatch.release();
  }

  async #cullIdleResources() {
    if (this.#wards.idle.size === 0) return;
    debug(`Culling ${this.#wards.idle.size.toLocaleString()} idle resources`);
    const destroyIdleResources = this.#wards.idle.map((bay) => bay.reserve({ id: 'cull', associate: () => {} }).destroy().catch(() => {}));
    await Promise.all(destroyIdleResources);
  }
}

module.exports = Dormitory;
