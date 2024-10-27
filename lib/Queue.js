const debug = require('debug')('XPool:Queue');
const Request = require('./Request');
const AsyncLatch = require('./utils/AsyncLatch');

class Queue {

  #requests = [];
  #drained;
  #stats = { size: 0, active: 0 };

  add(id, handler) {
    debug(`Adding request [${id}]`)
    const request = new Request(id, handler);
    this.#requests.push(request);
    this.#stats.size++;
    return request;
  }

  check() {
    debug('Checking queue');
    const request = this.#findNextRequest();
    if (request) this.#dispatch(request);
  }

  abort(request) {
    request.abort();
    this.remove(request);
  }

  remove(request) {
    const index = this.#findIndex(request);
    if (index !== -1) this.#removeAtIndex(index, request);
  }

  async drain() {
    this.#drained = new AsyncLatch();
    if (this.#stats.size === 0) this.#drained?.release();
    return this.#drained.block();
  }

  stats() {
    return { ...this.#stats }
  }

  #findNextRequest() {
    return this.#requests.find(r => !r._isActive());
  }

  #dispatch(request) {
    debug(`Dispatching request [${request.id}]`);
    this.#stats.size--;
    this.#stats.active++;
    request._dispatch();
    if (this.#stats.size === 0) this.#drained?.release();
  }

  requeue(request) {
    debug(`Requeueing request [${request.id}]`);
    if (this.#exists(request)) this.#reset(request)
  }

  #exists(request) {
    return this.#requests.some(r => r === request);
  }

  #reset(request) {
    request._reset();
    this.#stats.size++;
    this.#stats.active--;
  }

  #findIndex(request) {
    return this.#requests.findIndex(r => r === request);
  }

  #removeAtIndex(index, request) {
    debug(`Removing request [${request.id}] at position ${index}`);
    this.#requests.splice(index, 1);
    if (request._isActive()) this.#stats.active--
    else this.#stats.size--;
  }
}

module.exports = Queue;
