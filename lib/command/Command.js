const { EventEmitter } = require('node:events');
const TimeLimit = require('../utils/TimeLimit');

class Command extends EventEmitter {

  static SUCCESS = Symbol('success');
  static ERROR = Symbol('error');
  static TIMEOUT = Symbol('timeout');
  static POST_TIMEOUT_SUCCESS = Symbol('post_timeout_success');
  static POST_TIMEOUT_ERROR = Symbol('post_timeout_error');
  static POST_ABORT_SUCCESS = Symbol('post_abort_success');
  static POST_ABORT_ERROR = Symbol('post_abort_error');

  #name;
  #pool;
  #fn;
  #timeout;
  #timeLimit;
  #latch;
  #events = { SUCCESS: Command.SUCCESS, ERROR: Command.ERROR, TIMEOUT: Command.TIMEOUT };

  constructor(name, pool, fn, timeout, latch) {
    super();
    this.#pool = pool
    this.#fn = fn;
    this.#timeout = timeout;
    this.#timeLimit = new TimeLimit(name, timeout);
    this.#latch = latch;
  }

  async execute(...args) {
    await this.#latch.block();

    try {
      this.#latch.activate();
      this.#timeLimit.onTimeout(() => this.#onTimeout());
      await this.#timeLimit.restrict(this.#runCommand(...args));
    } finally {
      this.#latch.release();
    }
  }

  abort() {
    this.#events = Object.assign(this.#events, { SUCCESS: Command.POST_ABORT_SUCCESS, ERROR: Command.POST_ABORT_ERROR });
    this.#timeLimit.abort();
  }

  async #runCommand(...args) {
    try {
      const resource = await this.#fn(this.#pool, ...args)
      this.emit(this.#events.SUCCESS, { resource });
    } catch (error) {
      this.emit(this.#events.ERROR, { error });
      throw error;
    }
  }

  #onTimeout() {
    this.#events = Object.assign(this.#events, { SUCCESS: Command.POST_TIMEOUT_SUCCESS, ERROR: Command.POST_TIMEOUT_ERROR });
    this.emit(this.#events.TIMEOUT, { timeout: this.#timeout })
  };
}

module.exports = Command;
