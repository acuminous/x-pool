const { inspect } = require('node:util');

const debug = require('debug')('XPool:AcquireQueue');

const AcquireRequest = require('./queue2/AcquireRequest');
const NullRequest = require('./queue2/NullRequest');
const List = require('./utils/List');
const AsyncLatch = require('./utils/AsyncLatch2');

class AcquireQueue {

  #partitions = { queued: new List('queued'), dispatched: new List('dispatched') };
  #drainLatch = new AsyncLatch();

  get size() {
    return this.#partitions.queued.size;
  }

  add(id, handler) {
    return new AcquireRequest(id, this.#partitions, handler).initiate().queue();
  }

  check() {
    debug('Checking queue');
    this.#next().dispatch();
    this.#checkDrained();
  }

  async drain() {
    this.#drainLatch.initiate();
    this.#checkDrained();
    await this.#drainLatch.wait();
  }

  #next() {
    return this.#partitions.queued.peak() || new NullRequest();
  }

	#checkDrained() {
		if (!this.#drainLatch.initiated) return
	  if (this.#hasQueuedRequests()) return debug('Checking queue');
    this.#drainLatch.finalise();
	}

  #hasQueuedRequests() {
    return this.size > 0;
  }

  [inspect.custom]() {
    return `${this.constructor.name} { queued: ${this.#partitions.queued.size}, dispatched: ${this.#partitions.dispatched.size} }`
  }
}

module.exports = AcquireQueue;
