const debug = require('debug')('XPool:Request');
const AsyncLatch = require('./utils/AsyncLatch');

class Request {

  #id;
  #handler;
  #dispatched = false;
  #aborted = false;
  #attempts = 0;
  #responseLatch = new AsyncLatch();

  constructor(id, handler) {
    this.#id = id;
    this.#handler = handler;
    this.#responseLatch.activate();
  }

  get id() {
    return this.#id;
  }

  get attempts() {
    return this.#attempts;
  }

  queue() {
    debug(`Queueing request [${this.#id}]`);
    this.#dispatched = false;
  }


  dispatch() {
    debug(`Dispatching request [${this.#id}]`);
    this.#dispatched = true;
    this.#attempts++;
    this.#handler(this);
  }

  isDispatched() {
    return this.#dispatched;
  }

  isAborted() {
    return this.#aborted;
  }

  abort() {
    debug(`Aborting request [${this.#id}]`);
    this.#aborted = true;
    this.#responseLatch.release();
  }

  async block() {
    return this.#responseLatch.block();
  }

  release(resource) {
    this.#responseLatch.release(resource);
  }
}

module.exports = Request;
