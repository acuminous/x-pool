const { EventEmitter } = require('node:events');

class TimeLimit extends EventEmitter {

  static TIMEOUT = Symbol('timeout');

  #name;
  #duration;
  #timer = {};
  #abort = {};

  constructor(name, duration) {
    super();
    this.#name = name;
    this.#duration = duration;
  }

  async restrict(operations) {
    const promises = [].concat(operations, this.#startTimer(), this.#startAbort());
    return Promise.race(promises).finally(() => this.#done());
  }

  onTimeout(cb) {
    this.once(TimeLimit.TIMEOUT, cb);
  }

  abort() {
    this.#abort.reject(new Error(`Aborted ${this.#name}`));
  }

  #startTimer() {
    return new Promise((resolve, reject) => {
      const id = this.#scheduleTimeout();
      this.#timer = { id, resolve, reject };
    });
  }

  #scheduleTimeout() {
    return setTimeout(() => {
      this.emit(TimeLimit.TIMEOUT);
      this.#timer.reject(new Error(`Failed to ${this.#name} within ${this.#duration.toLocaleString()}ms`));
    }, this.#duration).unref();
  }

  #startAbort() {
    return new Promise((resolve, reject) => {
      this.#abort = { resolve, reject };
    });
  }

  #done() {
    this.#stopTimer();
    this.#stopAbort();
  }

  #stopTimer() {
    clearTimeout(this.#timer.id);
    this.#timer.resolve();
  }

  #stopAbort() {
    this.#abort.resolve();
  }
}

module.exports = TimeLimit;
