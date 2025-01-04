const { EventEmitter } = require('node:events');

class SafeEventEmitter extends EventEmitter {

  #panic;

  constructor(panic) {
    super();
    this.#panic = panic;
  }

  emit(...args) {
    try {
      super.emit(...args);
    } catch (cause) {
      setImmediate(() => {
        const error = new Error('Custom event handlers must not throw errors', { cause });
        this.#panic(error);
      });
    }
  }
}

module.exports = SafeEventEmitter;
