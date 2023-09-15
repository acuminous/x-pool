module.exports = class ShutdownRequest {

  #resolve;
  #reject;
  #race;

  set resolve(resolve) {
    this.#resolve = resolve;
  }

  set reject(reject) {
    this.#reject = reject;
  }

  set race(race) {
    this.#race = race;
  }

  get race() {
    return this.#race;
  }

  resolve() {
    this.#resolve();
  }

  reject(err) {
    this.#reject(err);
  }
};
