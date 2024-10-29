const debug = require('debug')('XPool:Request');
const AsyncLatch = require('./utils/AsyncLatch');

class Request {

  #id;
  #handler;
  #stats;
  #location = 'queued';
  #aborted = false;
  #attempts = 0;
  #responseLatch = new AsyncLatch();

  constructor(id, handler, stats) {
    this.#id = id;
    this.#handler = handler;
    this.#stats = stats;
    this.#responseLatch.activate();
  }

  get id() {
    return this.#id;
  }

  get attempts() {
    return this.#attempts;
  }

  isQueued() {
    return this.#location === 'queued';
  }

  queue() {
    debug(`Queueing request [${this.#id}]`)
    this.#stats.queued();
  }

  dispatch() {
    debug(`Dispatching request [${this.#id}]`);
    this.#location = 'dispatched';
    this.#attempts++;
    this.#stats.dispatched();
    this.#handler(this);
  }

  requeue() {
    debug(`Requeueing request [${this.#id}]`);
    this.#location = 'queued';
    this.#stats.requeued();
  }

  isAborted() {
    return this.#aborted;
  }

  abort() {
    debug(`Aborting request [${this.#id}]`);
    this.#aborted = true;
    this.#responseLatch.release();
  }

  remove() {
    debug(`Removing request [${this.#id}]`);
    if (this.#location === 'queued') this.#stats.removedFromQueued();
    else if (this.#location === 'dispatched') this.#stats.removedFromDispatched();
  }

  async block() {
    return this.#responseLatch.block();
  }

  release(resource) {
    this.#responseLatch.release(resource);
  }
}

module.exports = Request;
