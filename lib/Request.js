const AsyncLatch = require('./utils/AsyncLatch');

class Request extends AsyncLatch {

  #id;
  #handler;
  #active = false;
  #aborted = false;
  #attempts = 0;

  constructor(id, handler) {
    super();
    this.#id = id;
    this.#handler = handler;
  }

  get id() {
    return this.#id;
  }

  get attempts() {
    return this.#attempts;
  }

  abort() {
    this.#aborted = true;
    this.release();
  }

  isAborted() {
    return this.#aborted;
  }

  _dispatch() {
    this.#active = true;
    this.#attempts++;
    this.#handler(this);
  }

  _isActive() {
    return this.#active;
  }

  _reset() {
    this.#active = false;
  }
}

module.exports = Request;
