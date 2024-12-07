const { inspect } = require('node:util');

const debug = require('debug')('XPool:Queue');

const NullRequest = require('./acquire/NullRequest');
const SingleItemStore = require('./stores/SingleItemStore');
const MultiItemStore = require('./stores/MultiItemStore');
const NullStore = require('./stores/NullStore');
const AsyncLatch = require('./utils/AsyncLatch');

class Queue {

  #stores = {
    unqueued: new SingleItemStore('unqueued'),
    queued: new MultiItemStore('queued'),
    dispatched: new MultiItemStore('dispatched'),
    fulfilled: new NullStore('fulfilled'),
    aborted: new NullStore('aborted'),
  };
  #drainLatch = new AsyncLatch();
  #config;

  constructor(config) {
    this.#config = config;
  }

  get queued() {
    return this.#stores.queued.size;
  }

  get #size() {
    return Object.values(this.#stores).reduce((size, partition) => size + partition.size, 0);
  }

  add(request) {
    if (this.#config.maxQueueSize === this.queued) throw new Error(`Maximum queue size of ${this.#config.maxQueueSize.toLocaleString()} exceeded`);
    request.initiate(this.#stores).queue();
  }

  check() {
    debug('Checking queue');
    this.#next().dispatch();
    this.#checkDrained();
  }

  async drain() {
    this.#drainLatch.activate();
    this.#checkDrained();
    await this.#drainLatch.block();
  }

  isDrained() {
    return this.#drainLatch.activated && this.#size === 0;
  }

  #checkDrained() {
    if (this.isDrained()) this.#drainLatch.release();
  }

  #next() {
    return this.#stores.queued.peek() || new NullRequest();
  }

  [inspect.custom]() {
    return `${this.constructor.name} { queued: ${this.#stores.queued.size}, dispatched: ${this.#stores.dispatched.size} }`;
  }
}

module.exports = Queue;
