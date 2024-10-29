const debug = require('debug')('XPool:Queue');
const Request = require('./Request');
const QueueStats = require('./QueueStats');
const AsyncLatch = require('./utils/AsyncLatch');

class Queue {

  #requests = [];
  #stats = new QueueStats();
  #drainLatch = new AsyncLatch();

  add(id, handler) {
    const request = new Request(id, handler, this.#stats)
    request.queue();
    this.#requests.push(request);
    return request;
  }

  check() {
    debug('Checking queue');
    this.#findNextRequest()?.dispatch();
    if (this.#stats.isDrained()) this.#drainLatch.release();
  }

  abort(request) {
    request.abort();
    this.remove(request);
  }

  remove(request) {
    request.remove();
    this.#removeRequest(request);
  }

  requeue(request) {
    if (this.#exists(request)) request.requeue()
  }

  async drain() {
    this.#drainLatch.activate();
    return this.#stats.isDrained() ? this.#drainLatch.release() : this.#drainLatch.block();
  }

  stats() {
    return this.#stats.toJSON();
  }

  #findNextRequest() {
    return this.#requests.find(r => r.isQueued());
  }

  #exists(request) {
    return this.#requests.some(r => r === request);
  }

  #removeRequest(request) {
    const index = this.#requests.findIndex(r => r === request);
    if (index !== -1) this.#requests.splice(index, 1);
  }
}

module.exports = Queue;
