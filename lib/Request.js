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
    this.#stats.queue();
    return this;
  }

  dispatch() {
    this.#location = 'dispatched';
    this.#attempts++;
    this.#stats.dispatch();
    this.#handler(this);
    return this;
  }

  reset() {
    this.#location = 'queued';
    this.#stats.reset();
    return this;
  }

  isAborted() {
    return this.#aborted;
  }

  abort() {
    this.#aborted = true;
    this.#responseLatch.release();
    return this;
  }

  remove() {
    if (this.#location === 'queued') this.#stats.removeQueued();
    else if (this.#location === 'dispatched') this.#stats.removeDispatched();
    return this;
  }

  async block() {
    return this.#responseLatch.block();
  }

  release(resource) {
    this.#responseLatch.release(resource);
    return this;
  }
}

module.exports = Request;
