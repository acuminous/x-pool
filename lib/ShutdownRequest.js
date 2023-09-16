/* eslint no-dupe-class-members: ["off"] */

module.exports = class ShutdownRequest {

  #resolve;
  #reject;
  #race;

  start(timeout) {
    const operation = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    this.#race = Promise.race([timeout, operation]);
  }

  get promise() {
    return this.#race;
  }

  resolve() {
    this.#resolve();
  }

  reject(err) {
    this.#reject(err);
  }
};
