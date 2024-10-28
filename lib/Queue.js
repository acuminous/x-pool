const debug = require('debug')('XPool:Queue');
const Request = require('./Request');
const QueueStats = require('./QueueStats');
const AsyncLatch = require('./utils/AsyncLatch');

class Queue {

  #requests = [];
  #stats = new QueueStats();
  #drainLatch = new AsyncLatch();

  add(id, handler) {
    debug(`Adding request [${id}]`)
    const request = new Request(id, handler, this.#stats).queue();
    this.#requests.push(request);
    return request;
  }

  check() {
    debug('Checking queue');
    const request = this.#findNextRequest();
    if (request) this.#dispatch(request);
  }

  abort(request) {
    debug(`Aborting request [${request.id}]`);
    request.abort();
    this.remove(request);
  }

  remove(request) {
    debug(`Removing request [${request.id}]`);
    request.remove();
    const index = this.#findIndex(request);
    if (index !== -1) this.#removeAtIndex(index, request);
  }

  async drain() {
    this.#drainLatch.activate();
    if (this.isDrained()) this.#drainLatch.release();
    return this.#drainLatch.block();
  }

  isDrained() {
    return this.#stats.isDrained();
  }

  stats() {
    return this.#stats.export();
  }

  #findNextRequest() {
    return this.#requests.find(r => r.isQueued());
  }

  #dispatch(request) {
    debug(`Dispatching request [${request.id}]`);
    request.dispatch();
    if (this.isDrained()) this.#drainLatch.release();
  }

  requeue(request) {
    debug(`Requeueing request [${request.id}]`);
    if (this.#exists(request)) this.#reset(request)
  }

  #exists(request) {
    return this.#requests.some(r => r === request);
  }

  #reset(request) {
    request.reset();
  }

  #findIndex(request) {
    return this.#requests.findIndex(r => r === request);
  }

  #removeAtIndex(index) {
    this.#requests.splice(index, 1);
  }
}

module.exports = Queue;
