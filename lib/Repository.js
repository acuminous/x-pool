const { EventEmitter } = require('node:events');

const debug = require('debug')('XPool:Repository');

const fwd = require('fwd');
const ResourceBay = require('./bay/ResourceBay');
const NullBay = require('./bay/NullBay');
const NullStore = require('./stores/NullStore');
const SingleItemStore = require('./stores/SingleItemStore');
const MultiItemStore = require('./stores/MultiItemStore');

class Repository extends EventEmitter {

  #config;
  #commandFactory;
  #stopRequest;
  #stores = {
    initialising: new MultiItemStore('initialising'),
    idle: new MultiItemStore('idle'),
    acquired: new MultiItemStore('acquired'),
    doomed: new MultiItemStore('doomed'),
    segregated: new MultiItemStore('segregated'),
    destroyed: new NullStore('destroyed'),
  };

  constructor(config, commandFactory) {
    super();
    this.#config = config;
    this.#commandFactory = commandFactory;
  }

  forwardEvents(target) {
    fwd(this, target);
  }

  get size() {
    return Object.values(this.#stores).reduce((size, partition) => size + partition.size, 0);
  }

  get deficit() {
    const { initialising, idle } = this.#stores;
    const minPoolSizeDeficit = this.#config.minPoolSize - this.size;
    const minIdleResourcesDeficit = this.#config.minIdleResources - initialising.size - idle.size;
    const deficit = Math.max(0, minPoolSizeDeficit, minIdleResourcesDeficit);
    const capacity = this.#config.maxPoolSize - this.size;
    return Math.min(deficit, capacity);
  }

  hasCapacity() {
    return this.#hasIdleResources() || this.#canExtend();
  }

  stats() {
    const { initialising, idle, acquired, doomed, segregated } = this.#stores;
    return {
      size: this.size,
      initialising: initialising.size,
      idle: idle.size,
      acquired: acquired.size,
      doomed: doomed.size,
      segregated: segregated.size,
    };
  }

  extend() {
    const bay = new ResourceBay(this.#stores, this.#commandFactory);
    bay.forwardEvents(this);
    return bay;
  }

  reserve(request) {
    return (this.#stores.idle.peek() || this.extend()).reserve(request);
  }

  locate(resource) {
    return this.#stores.acquired.find((bay) => bay.contains(resource)) || new NullBay();
  }

  async stop(stopRequest) {
    this.#stopRequest = stopRequest;
    await this.cull();
  }

  async cull() {
    await this.#cullIdleResource();
    if (this.#isDrained()) this.#stopRequest.finalise();
  }

  async #cullIdleResource() {
    if (!this.#hasIdleResources()) return;
    debug(`Culling ${this.#stores.idle.size.toLocaleString()} idle resources`);
    const destroyIdleResources = this.#stores.idle.map((bay) => bay.reserve(this.#stopRequest).destroy().catch(() => {}));
    await Promise.all(destroyIdleResources);
  }

  #hasIdleResources() {
    return this.#stores.idle.size > 0;
  }

  #canExtend() {
    return this.size < this.#config.maxPoolSize;
  }

  #isDrained() {
    return this.size === this.#stores.segregated.size;
  }
}

module.exports = Repository;
