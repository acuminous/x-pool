const { EventEmitter } = require('node:events');

const debug = require('debug')('XPool:Repository');
const fwd = require('fwd');

const MaxPoolSizeExceeded = require('./errors/MaxPoolSizeExceeded');
const ResourceBay = require('./bay/ResourceBay');
const NullBay = require('./bay/NullBay');
const NullStore = require('./stores/NullStore');
const MultiItemStore = require('./stores/MultiItemStore');

class Repository extends EventEmitter {

  #config;
  #commandFactory;
  #stores = {
    initialising: new MultiItemStore('initialising'),
    idle: new MultiItemStore('idle'),
    acquired: new MultiItemStore('acquired'),
    reinstating: new MultiItemStore('reinstating'),
    doomed: new MultiItemStore('doomed'),
    timedout: new MultiItemStore('timedout'),
    destroyed: new NullStore('destroyed'),
    zombie: new MultiItemStore('zombie'),
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
    const { initialising, idle, reinstating } = this.#stores;
    const minPoolSizeDeficit = this.#config.minPoolSize - this.size;
    const minIdleResourcesDeficit = this.#config.minIdleResources - initialising.size - idle.size - reinstating.size;
    const deficit = Math.max(0, minPoolSizeDeficit, minIdleResourcesDeficit);
    const capacity = this.#config.maxPoolSize - this.size;
    return Math.min(deficit, capacity);
  }

  hasCapacity() {
    return this.#hasIdleResources() || this.#canExtend();
  }

  stats() {
    const { initialising, idle, acquired, reinstating, doomed, timedout, zombie } = this.#stores;
    return {
      size: this.size,
      initialising: initialising.size,
      idle: idle.size,
      acquired: acquired.size,
      reinstating: reinstating.size,
      doomed: doomed.size,
      timedout: timedout.size,
      zombie: zombie.size,
    };
  }

  extend() {
    if (this.size === this.#config.maxPoolSize) throw new MaxPoolSizeExceeded(`Cannot extend beyond the maximum pool size of ${this.#config.maxPoolSize}`);
    const { validate, reset } = this.#config;
    const bay = new ResourceBay(this.#stores, this.#commandFactory, { validate, reset });
    bay.forwardEvents(this);
    return bay;
  }

  ensure() {
    return this.#stores.idle.peek() || this.extend();
  }

  locate(resource) {
    return this.#stores.acquired.find((bay) => bay.contains(resource)) || new NullBay();
  }

  cull(stopRequest) {
    const doomed = this.#stores.idle.map((bay) => bay.reserve(stopRequest).skipValidation());
    debug(`Culling ${doomed.length.toLocaleString()} idle resources`);

    const operations = doomed.map((bay) => bay.destroy().catch(() => {}));
    await Promise.all(operations).then(() => {
      if (this.#isDrained()) stopRequest.finalise();
    });
  }

  #hasIdleResources() {
    return this.#stores.idle.size > 0;
  }

  #canExtend() {
    return this.size < this.#config.maxPoolSize;
  }

  #isDrained() {
    return this.size === this.#stores.timedout.size + this.#stores.zombie.size;
  }
}

module.exports = Repository;
