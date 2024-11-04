const debug = require('debug')('XPool:Queue');
const RequestFacade = require('./RequestFacade');
const RequestFactory = require('./RequestFactory');
const ArrayUtils = require('../utils/ArrayUtils');
const AsyncLatch = require('../utils/AsyncLatch');

class Queue {

  #queued = [];
  #dispatched = [];
  #drainLatch = new AsyncLatch();

  get size() {
    return this.#queued.length;
  }

  add(id, handler) {
    const factory = new RequestFactory(this.#queued, this.#dispatched);
    return new RequestFacade(id, handler, factory).queue();
  }

  check() {
    debug('Checking queue');
    this.#next()?.dispatch();
    if (this.#isDrained()) this.#drainLatch.release();
  }

  async drain() {
    this.#drainLatch.activate();
    return this.#isDrained() ? this.#drainLatch.release() : this.#drainLatch.block();
  }

  #next() {
    return this.#queued.shift();
  }

  #isDrained() {
    return this.#queued.length === 0;
  }
}

module.exports = Queue;
