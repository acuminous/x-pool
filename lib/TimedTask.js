const { OperationTimedout } = require('./Errors');

module.exports = class TimedTask {
  constructor(name, fn, timeout, onLateYield) {
    this._name = name;
    this._fn = fn;
    this._timeout = timeout;
    this._onLateYield = onLateYield;
  }

  execute() {
    return new Promise((resolve, reject) => {
      let timedout = false;
      const timerId = setTimeout(() => {
        timedout = true;
        const err = new OperationTimedout(`${this._name} timedout after ${this._timeout}ms`);
        reject(err);
      }, this._timeout);

      this._fn().then((result) => {
        clearTimeout(timerId);
        timedout ? this._onLateYield(result) : resolve(result);
      });
    });
  }
};
