const { EventEmitter } = require('node:events');

class TimeLimitless extends EventEmitter {

  #name;
  #abort = {};

  constructor(name) {
    super();
    this.#name = name;
  }

  async restrict(operations) {
    const promises = [].concat(operations, this.#startAbort());
    return Promise.race(promises).finally(() => this.#done());
  }

  onTimeout(cb) {
  }

  abort() {
    this.#abort.reject(new Error(`Aborted ${this.#name}`));
  }

  #startAbort() {
    return new Promise((resolve, reject) => {
      this.#abort = { resolve, reject }
    });
  }

  #done() {
    this.#stopAbort();
  }

  #stopAbort() {
    this.#abort.resolve();
  }
}

module.exports = TimeLimitless;
