const { inspect } = require('node:util');

const debug = require('debug')('XPool:AcquireQueue');

const AcquireRequest = require('./requests/acquire/AcquireRequest');
const NullRequest = require('./requests/acquire/NullRequest');
const Partition = require('./Partition');
const AsyncLatch = require('./utils/AsyncLatch');

class AcquireQueue {

  #partitions = { queued: new Partition('queued'), dispatched: new Partition('dispatched') };
  #drainLatch = new AsyncLatch();
  #maxQueueSize;

  constructor(maxQueueSize) {
    this.#maxQueueSize = maxQueueSize;
  }

  get size() {
    return this.#partitions.queued.size;
  }

  add(id, handler) {
    if (this.#maxQueueSize === this.size) throw new Error(`Maximum queue size of ${this.#maxQueueSize.toLocaleString()} exceeded`);
    return new AcquireRequest(id, this.#partitions, handler).initiate().queue();
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
    return this.#partitions.queued.peak() || new NullRequest();
  }

	#checkDrained() {
		if (!this.#drainLatch.activated) return
	  if (this.#hasQueuedRequests()) return debug('Checking queue');
    this.#drainLatch.release();
	}

  #hasQueuedRequests() {
    return this.size > 0;
  }

  [inspect.custom]() {
    return `${this.constructor.name} { queued: ${this.#partitions.queued.size}, dispatched: ${this.#partitions.dispatched.size} }`
  }
}

module.exports = AcquireQueue;
