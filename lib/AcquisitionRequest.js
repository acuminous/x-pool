module.exports = class AcquisitionRequest {

  #resolve;
  #reject;
  #waiting = true;

  constructor({ resolve, reject }) {
    this.#resolve = resolve;
    this.#reject = reject;
  }

  isWaiting() {
    return this.#waiting;
  }

  start() {
    this.#waiting = false;
    return this;
  }

  resolve() {
    this.#resolve(this);
  }

  reject(err) {
    this.#reject(err);
  }
};
