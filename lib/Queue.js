const debug = require('debug')('XPool:Queue');
const Request = require('./Request');
const AsyncLatch = require('./utils/AsyncLatch');

class Queue {

  #queued = [];
  #dispatched = [];
  #drainLatch = new AsyncLatch();

  add(id, handler) {
    const request = new Request(id, handler)
    this.#queued.push(request);
    return request;
  }

  check() {
    debug('Checking queue');
    const request = this.#findNextRequest();
    if (request) {
      this.#dispatched.push(request);
      request.dispatch();
    }

    if (this.#queued.length === 0) this.#drainLatch.release();
  }

  abort(request) {
    this.remove(request);
    request.abort();
  }

  remove(request) {
    this.#removeRequest(request, this.#dispatched) || this.#removeRequest(request, this.#queued);
  }

  requeue(request) {
    if (this.#exists(request)) {
      this.#removeRequest(request, this.#dispatched);
      this.#queued.unshift(request);
    }
  }

  async drain() {
    this.#drainLatch.activate();
    return this.#queued.length === 0 ? this.#drainLatch.release() : this.#drainLatch.block();
  }

  stats() {
    return { queued: this.#queued.length, dispatched: this.#dispatched.length };
  }

  #findNextRequest() {
    return this.#queued.shift();
  }

  #exists(request) {
    return this.#dispatched.some(r => r === request);
  }

  #removeRequest(request, array) {
    const index = array.findIndex(r => r === request);
    if (index === -1) return false
    array.splice(index, 1);
    return true;
  }
}

module.exports = Queue;
