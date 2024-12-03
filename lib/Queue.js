const { inspect } = require('node:util');

const debug = require('debug')('XPool:Queue');

const AcquireRequest = require('./acquire/AcquireRequest');
const NullRequest = require('./acquire/NullRequest');
const Partition = require('./Partition');
const AsyncLatch = require('./utils/AsyncLatch');
const ExponentialBackoff = require('./utils/ExponentialBackoff');

class Queue {

  #partitions = { queued: new Partition('queued'), dispatched: new Partition('dispatched') };
  #drainLatch = new AsyncLatch();
  #config;

  constructor(config) {
    this.#config = config;
  }

  get size() {
    return this.#partitions.queued.size;
  }

  add(id, handler) {
    if (this.#config.maxQueueSize === this.size) throw new Error(`Maximum queue size of ${this.#config.maxQueueSize.toLocaleString()} exceeded`);
    const backoff = new ExponentialBackoff(this.#config.backoff);
    return new AcquireRequest(id, this.#partitions, handler, backoff).initiate().queue();
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

  #next() {
    return this.#partitions.queued.peek() || new NullRequest();
  }

  #checkDrained() {
    if (!this.#drainLatch.activated) return;
    if (this.#hasQueuedRequests()) return debug('Checking queue');
    this.#drainLatch.release();
  }

  #hasQueuedRequests() {
    return this.size > 0;
  }

  [inspect.custom]() {
    return `${this.constructor.name} { queued: ${this.#partitions.queued.size}, dispatched: ${this.#partitions.dispatched.size} }`;
  }
}

module.exports = Queue;
