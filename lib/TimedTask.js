const { OperationTimedout, OperationAborted } = require('./Errors');

const NO_OP = () => { };

module.exports = class TimedTask {
  constructor({ name, fn, timeout, onLateResolve = NO_OP }) {
    this._name = name;
    this._fn = fn;
    this._timeout = timeout;
    this._onLateResolve = onLateResolve;
    this._aborted = false;
    this._timedout = false;
    this._reject;
  }

  execute() {
    return new Promise((resolve, reject) => {
      this._reject = reject;
      const timerId = setTimeout(() => {
        this._timedout = true;
        const err = new OperationTimedout(`${this._name} timedout after ${this._timeout}ms`);
        reject(err);
      }, this._timeout).unref();

      this._fn(this).then((result) => {
        clearTimeout(timerId);
        if (this.isTimedout() && !this.isAborted()) return this._onLateResolve(this, result);
        resolve(result);
      }).catch(reject);
    });
  }

  abort() {
    this._aborted = true;
    const err = new OperationAborted(`${this._name} aborted`);
    this._reject(err);
  }

  isAborted() {
    return this._aborted;
  }

  isTimedout() {
    return this._timedout;
  }

  isOK() {
    return !(this._aborted || this._timedout);
  }
};
