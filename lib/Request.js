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
    this.#stats.queued();
  }

  dispatch() {
    this.#location = 'dispatched';
    this.#attempts++;
    this.#stats.dispatched();
    this.#handler(this);
  }

  requeue() {
    this.#location = 'queued';
    this.#stats.requeued();
  }

  isAborted() {
    return this.#aborted;
  }

  abort() {
    this.#aborted = true;
    this.#responseLatch.release();
  }

  remove() {
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
