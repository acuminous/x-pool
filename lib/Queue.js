const debug = require('debug')('XPool:Queue');
const Request = require('./Request');
const ArrayUtils = require('./utils/ArrayUtils');
const AsyncLatch = require('./utils/AsyncLatch');

class Queue {

  #queued = [];
  #dispatched = [];
  #drainLatch = new AsyncLatch();

  add(id, handler) {
    const request = new Request(id, handler)
    this.#queued.push(request);
    request.queue();
    return request;
  }

  check() {
    debug('Checking queue');
    const request = this.#next();
    if (request) this.#dispatch(request);
    if (this.#isDrained()) this.#drainLatch.release();
  }

  abort(request) {
    this.remove(request);
    request.abort();
  }

  remove(request) {
    if (request.isDispatched()) ArrayUtils.remove(request, this.#dispatched)
    else ArrayUtils.remove(request, this.#queued)
  }

  requeue(request) {
    ArrayUtils.remove(request, this.#dispatched);
    this.#queued.unshift(request);
    request.queue();
  }

  async drain() {
    this.#drainLatch.activate();
    return this.#isDrained() ? this.#drainLatch.release() : this.#drainLatch.block();
  }

  stats() {
    return { queued: this.#queued.length, dispatched: this.#dispatched.length };
  }

  #next() {
    return this.#queued.shift();
  }

  #dispatch(request) {
    this.#dispatched.push(request);
    request.dispatch();
  }

  #isDrained() {
    return this.#queued.length === 0;
  }
}

module.exports = Queue;
