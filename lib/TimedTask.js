const { OperationTimedout } = require('./Errors');

const NO_OP = () => { };

module.exports = class TimedTask {
  constructor({ name, fn, timeout, onLateResolve = NO_OP }) {
    this._name = name;
    this._fn = fn;
    this._timeout = timeout;
    this._onLateResolve = onLateResolve;
    this._timedout = false;
  }

  execute() {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        this._timedout = true;
        const err = new OperationTimedout(`${this._name} timedout after ${this._timeout}ms`);
        reject(err);
      }, this._timeout).unref();

      this._fn(this).then((result) => {
        clearTimeout(timerId);
        if (this.isAborted()) return this._onLateResolve(result);
        resolve(result);
      }).catch(reject);
    });
  }

  isAborted() {
    return this._timedout;
  }
};
