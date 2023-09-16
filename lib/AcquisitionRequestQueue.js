/* eslint no-shadow: ["error", { "allow": ["request"] }] */

const AcquisitionRequest = require('./AcquisitionRequest');

module.exports = class AcquisitionRequestQueue {
  #queue = [];

  add(resolve, reject) {
    const request = new AcquisitionRequest({ resolve, reject });
    this.#queue.unshift(request);
  }

  remove(request) {
    const index = this.#queue.indexOf(request);
    if (index >= 0) this.#queue.splice(index, 1);
  }

  hasRequests() {
    return this.#queue.length > 0;
  }

  next() {
    const request = this.#queue.find((request) => request.isWaiting());
    return request?.start();
  }

  stats() {
    const waiting = this.#queue.filter((request) => request.isWaiting());
    return { queued: waiting.length };
  }
};
