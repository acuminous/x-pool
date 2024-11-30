const debug = require('debug')('XPool:Queue:AbortedRequest');
const BaseRequest = require('./BaseRequest');

class AbortedRequest extends BaseRequest {

  #error;

  constructor(error) {
    super();
    this.#error = error;
  }

  get name() {
    return 'aborted';
  }

  dequeue() {
    throw this.#error;
  }

  requeue() {
    debug(`Suppressing requeue of ${this.name} request`)
  };
}

module.exports = AbortedRequest;
